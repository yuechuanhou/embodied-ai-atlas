# Embodied AI Atlas · 具身智能知识图谱

A versioned, extensible, Markdown-first learning website for Embodied AI / robotics data, model training, evaluations, and industry research.

## First release (v0.1.0)

- 26 Chinese-language content pages across 7 areas
- Main narrative: sensing → data collection → processing → data recipe → model training → evaluation → deployment feedback
- Comparison of 8 publicly documented robotics company/model approaches, with original source links and disclosure caveats
- Robotics foundation concept pages and cross-linked bilingual glossary
- Local full-text search (press `/`), sidebar navigation, table of contents, light/dark mode, mobile layout
- **No external runtime libraries, external fonts or remote APIs.** Generated `dist/index.html` can be opened directly, including offline.

## Edit and rebuild

Install Python 3.9+ and the lightweight Markdown renderer:

```bash
python -m pip install -r requirements.txt
python build.py
```

Open `dist/index.html` in your browser. The builder also writes `../Embodied_AI_Atlas_v0.1.html` for convenient sharing.

Content is in `content/*.md`. To add a page, create a Markdown file and register it in `content/manifest.json` with `id`, `section`, `title`, `file`, `summary`, `tags`, `related`, and `maturity` (publication maturity, **not** user learning progress). Rebuild.

Internal links in Markdown follow the pattern `[VIO](?page=sensors-and-estimation)`. Use plain absolute HTTPS links for external sources.

Site code:

- `assets/site.css` — responsive styling
- `assets/site.js` — navigation/search/rendering
- `build.py` — Markdown to single-file HTML build
- `content/manifest.json` — navigation and knowledge relations

## Editing philosophy

Keep concepts, research reports, and personal notes in separate articles; build hyperlinks between them. Label model version and source date. Do not merge total data assets with training pool sizes or claim unknown mixture ratios. This is an evolving learning knowledge base, not a fixed syllabus or a course tracker.

## Rights / sources

The summaries were written as original learning notes. External references point to the relevant public technical and corporate sources. Verify company disclosures as models evolve; examples are snapshots as of 2026-11-19.

## GitHub Pages deployment

This package includes `.github/workflows/deploy-pages.yml` for automatic publishing on every push to `main`, plus `scripts/validate_content.py` to check basic content integrity.

See [GITHUB_DEPLOY.md](GITHUB_DEPLOY.md) for one-time setup and a no-code editing workflow. The website is built from Markdown source and deployed directly; `dist/` is generated, not maintained by hand.
