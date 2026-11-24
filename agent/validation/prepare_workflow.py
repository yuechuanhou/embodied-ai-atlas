"""Prepare a pinned private workflow after the implementation PR is approved."""
import argparse
from pathlib import Path
import re


def prepare(revision, origin):
    if not re.fullmatch(r'[a-f0-9]{40}', revision) or not re.fullmatch(r'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev', origin):
        raise ValueError('Use an approved commit and exact HTTPS gateway origin')
    return (Path(__file__).with_name('private-workflow.yml.template').read_text()
        .replace('__ATLAS_APPROVED_REVISION__', revision).replace('__ATLAS_GATEWAY_ORIGIN__', origin))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    body = prepare(args.revision, args.origin)
    with args.output.open('x', encoding='utf-8') as file:
        file.write(body)
