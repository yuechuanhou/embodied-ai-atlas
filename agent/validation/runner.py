"""Pinned private Actions runner. Never put a proposal in workflow inputs or logs.

The parent holds an ephemeral Actions OIDC capability. The build subprocess gets
only the proposal and a credential-free environment, not the Actions credentials.
"""
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

STAGES = ('envelope', 'semantic_validation', 'content_validation', 'repository_build', 'render_regression')
SOURCE = 'https://github.com/yuechuanhou/embodied-ai-atlas.git'
PUBLIC_SOURCE = 'https://raw.githubusercontent.com/yuechuanhou/embodied-ai-atlas/'
SHA = re.compile(r'[a-f0-9]{40}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\Z')


class RunnerError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise RunnerError('redirect_rejected')


def read_url(url, *, headers=None, body=None, limit=400000):
    request = urllib.request.Request(url, data=body, headers=headers or {})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RunnerError('response_too_large')
    return data


def oidc(origin, job_id):
    endpoint = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL', '')
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.actions.githubusercontent.com'):
        raise RunnerError('oidc_environment_invalid')
    audience = origin + '/validation/' + job_id
    url = endpoint + ('&' if parsed.query else '?') + urllib.parse.urlencode({'audience': audience})
    token = json.loads(read_url(url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}, limit=30000)).get('value')
    if not isinstance(token, str) or not 100 < len(token) <= 16000:
        raise RunnerError('oidc_token_invalid')
    return token


def exchange(origin, job_id, action, body):
    # Reconciliation/reports are idempotent and do not call a paid model. Retry a
    # transient gateway response, never a dispatch or a content change.
    for attempt in range(4):
        try:
            return json.loads(read_url(origin + '/validation/' + job_id + '/' + action,
                headers={'Authorization': 'Bearer ' + oidc(origin, job_id), 'Content-Type': 'application/json'},
                body=json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()))
        except urllib.error.HTTPError as error:
            if error.code not in (409, 429, 502, 503, 504) or attempt == 3:
                raise RunnerError('gateway_request_failed') from None
        except (OSError, RunnerError, ValueError):
            if attempt == 3:
                raise RunnerError('gateway_request_failed') from None
        time.sleep(2 ** attempt)


def clean_env(revision):
    return {'PATH': os.defpath, 'LANG': 'C.UTF-8', 'GITHUB_SHA': revision, 'PYTHONDONTWRITEBYTECODE': '1', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0'}


def command(arguments, *, cwd, revision, timeout=120):
    result = subprocess.run(arguments, cwd=cwd, env=clean_env(revision), stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode != 0:
        raise RunnerError('validation_environment_failed')
    return result.stdout


def checkout(root, revision):
    if not SHA.fullmatch(revision):
        raise RunnerError('invalid_base')
    root.mkdir()
    command(['git', 'init', '--quiet'], cwd=root, revision=revision)
    command(['git', 'remote', 'add', 'origin', SOURCE], cwd=root, revision=revision)
    command(['git', 'fetch', '--quiet', '--depth=1', 'origin', revision], cwd=root, revision=revision)
    command(['git', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], cwd=root, revision=revision)
    if command(['git', 'rev-parse', 'HEAD'], cwd=root, revision=revision).decode().strip() != revision:
        raise RunnerError('checkout_mismatch')


def verify_toolchain(root, approved_lock):
    # A future dependency update must also update the approved executor revision;
    # it cannot quietly validate with a different renderer than the Pages build.
    actual = (root / 'agent/validation/requirements.lock').read_bytes()
    if hashlib.sha256(actual).digest() != hashlib.sha256(approved_lock).digest():
        raise RunnerError('validation_environment_failed')
    pinned = {line.split()[0] for line in actual.decode().splitlines() if line and not line.startswith(('#', ' '))}
    requirements = [line.strip() for line in (root / 'requirements.txt').read_text().splitlines() if line.strip() and not line.startswith('#')]
    if not all(requirement in pinned for requirement in requirements):
        raise RunnerError('validation_environment_failed')


def check_in_child(root, proposal, revision):
    """Run the existing semantic gate against this exact after-image."""
    report = {'status': 'failed', 'checks': {key: 'not_run' for key in STAGES},
        'counts': {'articles': 0, 'topics': 0}, 'error_code': 'validation_check_failed'}
    active = 'envelope'
    def progress(stage, status):
        nonlocal active
        active = stage
        if status == 'passed':
            report['checks'][stage] = 'passed'
    try:
        sys.path.insert(0, str(root))
        from agent.change_validation import validate_change_set
        result = validate_change_set(proposal, root=root, current_head=revision, progress=progress)
        report.update(status='passed', counts=result, error_code=None)
    except Exception:
        report['checks'][active] = 'failed'
    return report


def isolated_check(root, proposal, revision, directory):
    payload = directory / 'proposal.json'
    output = directory / 'report.json'
    payload.write_text(json.dumps(proposal, ensure_ascii=False), encoding='utf-8')
    command([sys.executable, '-I', str(Path(__file__).resolve()), '--check', str(root), str(payload), str(output), revision],
        cwd=directory, revision=revision, timeout=180)
    return json.loads(output.read_text(encoding='utf-8'))


def run():
    job_id, origin, validator = (os.environ.get(key, '') for key in ('ATLAS_VALIDATION_JOB', 'ATLAS_VALIDATION_ORIGIN', 'ATLAS_VALIDATOR_REVISION'))
    if not UUID.fullmatch(job_id) or not SHA.fullmatch(validator) or not re.fullmatch(r'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev', origin):
        raise RunnerError('runner_configuration_invalid')
    job = exchange(origin, job_id, 'claim', {})
    if job.get('job_id') != job_id or job.get('validator_revision') != validator:
        raise RunnerError('job_binding_mismatch')
    proposal, binding = job['proposal'], job['binding']
    expected = {key: proposal[key] for key in ('proposal_id', 'proposal_version', 'patch_digest', 'base_commit', 'contract_digest')}
    if binding != expected:
        raise RunnerError('job_binding_mismatch')
    report = {'status': 'failed', 'checks': {key: 'not_run' for key in STAGES}, 'counts': {'articles': 0, 'topics': 0}, 'error_code': 'validation_environment_failed'}
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='atlas-private-check-') as temp:
        directory = Path(temp)
        try:
            root = directory / 'source'
            checkout(root, binding['base_commit'])
            # Install a pinned, hash-checked toolchain from the approved runner
            # revision, rather than executing requirements supplied by a draft.
            lock = directory / 'requirements.lock'
            approved_lock = read_url(PUBLIC_SOURCE + validator + '/agent/validation/requirements.lock', limit=100000)
            verify_toolchain(root, approved_lock)
            lock.write_bytes(approved_lock)
            venv = directory / 'venv'
            command([sys.executable, '-m', 'venv', str(venv)], cwd=directory, revision=binding['base_commit'])
            python = venv / 'bin/python'
            command([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:',
                '--require-hashes', '-r', str(lock)], cwd=directory, revision=binding['base_commit'])
            # The child uses the venv interpreter while the OIDC-capable parent
            # stays outside the build environment.
            payload, output = directory / 'proposal.json', directory / 'report.json'
            payload.write_text(json.dumps(proposal, ensure_ascii=False), encoding='utf-8')
            command([str(python), '-I', str(Path(__file__).resolve()), '--check', str(root), str(payload), str(output), binding['base_commit']],
                cwd=directory, revision=binding['base_commit'], timeout=180)
            report = json.loads(output.read_text(encoding='utf-8'))
        except Exception:
            pass  # Do not print stdout, tracebacks, draft text or signed URLs.
    exchange(origin, job_id, 'report', {**report, 'binding': binding, 'validator_revision': validator})
    print(json.dumps({'status': report['status'], 'checks': report['checks'], 'counts': report['counts']}))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        if len(sys.argv) == 6 and sys.argv[1] == '--check' and SHA.fullmatch(sys.argv[5]):
            root, payload, output, revision = Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5]
            result = check_in_child(root, json.loads(payload.read_text(encoding='utf-8')), revision)
            output.write_text(json.dumps(result), encoding='utf-8')
        elif len(sys.argv) == 1:
            sys.exit(run())
        else:
            raise RunnerError('invalid_arguments')
    except Exception:
        print('validation_runner_failed')
        sys.exit(1)
