# Embodied AI Atlas · 具身智能知识图谱

**System-centric · Knowledge-driven · Context-aware**

A Markdown-first, offline-capable personal knowledge atlas for robotics and Embodied AI. Knowledge grows from real technical questions, not a fixed curriculum.

## v0.3

The v0.2 system model remains the foundation: six Lifecycle stages, three feedback Loops, nine primary Domains and four professional Contexts. Read [ARCHITECTURE.md](ARCHITECTURE.md) for identities, relations and evolution rules.

- A lightweight system map shows branches, Execution ↔ Learning, engineering/validation across the lifecycle, and one feedback return to the grouped Stages 01–05.
- Desktop navigation hides completely and remembers the local preference. Mobile navigation starts closed and supports keyboard/focus management.
- Canonical Domain breadcrumbs stay separate from contextual reading sources. Source returns and browser history restore reading position. Article contents remain available on narrow screens.
- Topic relations include same-article connections and derived backlinks. Stage entries can target a specific Topic with a relevance note.
- Search returns Article and Topic results with plain-text matching and Chinese/English heading aliases.
- Tiffany-inspired accents, graphite text and cool neutral surfaces support light/dark reading. Original Markdown, article IDs and historic links are preserved.

## Build and validate

Requires Python 3.10+ and Node.js 22+ for development checks. The static build alone supports Python 3.9+. Node/jsdom and the Agent schema checker are test-only; the output website needs no package installation or runtime service.

```sh
python -m pip install -r requirements-dev.txt
npm ci --ignore-scripts
python scripts/validate_content.py
python build.py
python scripts/smoke_test.py
npm test
python scripts/test_content.py
python scripts/test_agent.py
python scripts/test_agent_changes.py
```

Open `dist/index.html` in a browser, including offline. The build also writes `Embodied_AI_Atlas_v0.3.html` beside the repository for review/sharing. Generated output and local preview state are not committed.

The published/HTTP preview uses client-side history and scroll restoration. Direct `file:` use preserves native file navigation because browsers restrict history changes there; local preference storage may be unavailable, but theme/sidebar toggles still work for the open page.

The website Logo and bookmark icons use the same transparent orbit mark, without a tile or border. `assets/icons/mark.svg` owns its geometry and the light (`#08787e`) / dark (`#9de1d9`) colors. The build derives an inline SVG symbol, its theme colors and an adaptive SVG favicon from that source. The website follows its reading theme; favicons follow the browser's preferred color scheme, independently of the page theme. Transparent light/dark PNG and multi-size ICO fallbacks and an Apple touch icon use relative, content-versioned URLs for GitHub Pages subpaths. The standalone HTML embeds its icon links.

After editing the mark, regenerate raster companions with `python scripts/generate_icons.py` before building. That maintenance-only script needs `Pillow` and `PyMuPDF` (`python -m pip install Pillow PyMuPDF`); normal builds and CI do not need those packages.

## Sources and maintenance

| File | Role |
| --- | --- |
| `content/*.md` | Authoritative technical prose |
| `content/manifest.json` | Articles and one primary Domain each |
| `content/architecture.json` | Lifecycle, Loop and Context entry references; Loop-to-Stage membership |
| `content/topics.json` | Section Topics, typed relations and contextual Focus |
| `content/anchors.json` | Persistent IDs for registered headings and historical aliases |
| `assets/site.js`, `site.css`, `v02.css`, `lifecycle.css` | Routing, interactions and presentation; the minimal homepage map has a dedicated stylesheet |
| `assets/icons/` | Atlas favicon and Apple touch icon assets |
| `scripts/knowledge_export.py` | Derived content-addressed retrieval snapshot; full Markdown and every rendered heading |
| `scripts/generate_icons.py` | Regenerates transparent raster icons from the canonical SVG; only needed when changing the mark |
| `scripts/legacy_articles.json` | Historical article IDs protected while allowing growth |

Before adding knowledge, search for an existing Topic. Extend its canonical article/section or register a new Topic in the appropriate Domain. Add only useful typed relations and view mappings. When renaming a registered heading, update the lookup in metadata while preserving its anchor ID.

Old `?page=data-recipe` links remain valid. Views use `?view=stage&id=04`, `?view=loop&id=learning`, `?view=domain&id=data` and `?view=context&id=data-solutions`. Contextual reading uses `?page=data-recipe&context=stage%3A06`; section links append the stable heading anchor.

PR validation runs without deployment, including stacked PRs. Production deployment runs only from main or an explicitly requested workflow dispatch. Review branches and PRs before merging; main merges trigger GitHub Pages.

## Orbit private learning assistant

The Owner-only Worker and D1 are in use. Orbit supports reading companion, sidebar
and research modes, Claude answers, private candidates, conversation rename/pin/
delete/export, and versioned candidate review. Production deployment evidence and
pending device, branch-protection and recovery checks are centralized in
[operations readiness](agent/operations/README.md); the feature roadmap is
[AGENT_ROADMAP.md](AGENT_ROADMAP.md).

Formal knowledge publication is not deployed. The sections below distinguish the
offline proposal foundation and simulated demo from the actual private runtime.

[AGENT_ARCHITECTURE.md](AGENT_ARCHITECTURE.md) maps the agreed requirements to
design principles, module boundaries, implementation order and acceptance criteria.
[CONTENT_WORKFLOW.md](CONTENT_WORKFLOW.md) defines automatic learning/organization,
canonical placement and concrete Owner confirmation before public changes.

`agent/contracts/knowledge-change.schema.json`, `agent/proposals.py` and
`agent/change_validation.py` provide offline proposal integrity, approval binding,
semantic metadata checks and an isolated candidate build. They are not an authenticated
API, technical fact review or publisher. [Private DB notes](agent/db/README.md)
explain migration, ownership, retention and recovery obligations.
`requirements-dev.txt` adds the JSON Schema checker for these tests; ordinary static
builds still require only `requirements.txt`. No online chat, cloud resources, keys or
automatic publishing are configured by this foundation.

The [isolated Agent preview](agent/PREVIEW.md) includes an on-demand panel and
expanded change-review workbench. Build it separately with `python build.py --agent-demo`,
then run `npm run test:agent`. Output is `.preview/agent-demo/`, outside the production
Pages artifact. Retrieval uses real articles and headings; new knowledge and approvals
use clearly labeled simulations. Chats stay in memory and disappear on reload.

The [private runtime](agent/runtime/README.md) implements Worker-side Owner JWT
checks, D1 sessions/candidates, verified Pages snapshot synchronization and optional
OpenAI/Claude adapters. Production uses separately configured private credentials
and model limits, never repository values. [Deployment preparation](agent/runtime/DEPLOYMENT.md)
describes initial setup; use [the update flow](agent/runtime/UPDATE.md) for an existing
Worker. Private runtime builds/tests use Node 22.12+:

```sh
npm ci --ignore-scripts --prefix agent/runtime
npm run build --prefix agent/runtime
npm test --prefix agent/runtime
```

Normal builds also emit `knowledge-manifest.json` and a hashed knowledge index into
`dist/`. Set repository variable `ATLAS_AGENT_ORIGIN` only after a private destination
is verified; without it no placeholder private link is shown. The handoff carries only
canonical reading IDs in a fragment. No private backend or database deploys through
the existing Pages workflow.
