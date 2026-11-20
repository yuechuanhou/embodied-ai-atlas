# Embodied AI Atlas · 具身智能知识图谱

**System-centric · Knowledge-driven · Context-aware**

A Markdown-first, offline-capable personal knowledge atlas for robotics and Embodied AI. Knowledge grows from real technical questions, not a fixed curriculum.

## v0.3

The v0.2 system model remains the foundation: six Lifecycle stages, three feedback Loops, nine primary Domains and four professional Contexts. Read [ARCHITECTURE.md](ARCHITECTURE.md) for identities, relations and evolution rules.

- A compact system map shows branches, Execution ↔ Learning, engineering/validation across the lifecycle, and feedback from Stage 06 to 01–05.
- Desktop navigation hides completely and remembers the local preference. Mobile navigation starts closed and supports keyboard/focus management.
- Canonical Domain breadcrumbs stay separate from contextual reading sources. Source returns and browser history restore reading position. Article contents remain available on narrow screens.
- Topic relations include same-article connections and derived backlinks. Stage entries can target a specific Topic with a relevance note.
- Search returns Article and Topic results with plain-text matching and Chinese/English heading aliases.
- Tiffany-inspired accents, graphite text and cool neutral surfaces support light/dark reading. Original Markdown, article IDs and historic links are preserved.

## Build and validate

Requires Python 3.9+ and Node.js 22+ for development checks. Node/jsdom are test-only; the output website needs no package installation or runtime service.

```sh
python -m pip install -r requirements.txt
npm ci --ignore-scripts
python scripts/validate_content.py
python build.py
python scripts/smoke_test.py
npm test
python scripts/test_content.py
```

Open `dist/index.html` in a browser, including offline. The build also writes `Embodied_AI_Atlas_v0.3.html` beside the repository for review/sharing. Generated output and local preview state are not committed.

The published/HTTP preview uses client-side history and scroll restoration. Direct `file:` use preserves native file navigation because browsers restrict history changes there; local preference storage may be unavailable, but theme/sidebar toggles still work for the open page.

## Sources and maintenance

| File | Role |
| --- | --- |
| `content/*.md` | Authoritative technical prose |
| `content/manifest.json` | Articles and one primary Domain each |
| `content/architecture.json` | Lifecycle, Loop and Context entry references; Loop-to-Stage membership |
| `content/topics.json` | Section Topics, typed relations and contextual Focus |
| `content/anchors.json` | Persistent IDs for registered headings and historical aliases |
| `assets/site.js`, `site.css`, `v02.css` | Routing, interactions and presentation; the historical CSS filename is retained |
| `scripts/legacy_articles.json` | Historical article IDs protected while allowing growth |

Before adding knowledge, search for an existing Topic. Extend its canonical article/section or register a new Topic in the appropriate Domain. Add only useful typed relations and view mappings. When renaming a registered heading, update the lookup in metadata while preserving its anchor ID.

Old `?page=data-recipe` links remain valid. Views use `?view=stage&id=04`, `?view=loop&id=learning`, `?view=domain&id=data` and `?view=context&id=data-solutions`. Contextual reading uses `?page=data-recipe&context=stage%3A06`; section links append the stable heading anchor.

PR validation runs without deployment, including stacked PRs. Production deployment runs only from main or an explicitly requested workflow dispatch. Review branches and PRs before merging; main merges trigger GitHub Pages.
