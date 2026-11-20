# Embodied AI Atlas · 具身智能知识图谱

**System-centric · Knowledge-driven · Context-aware**

A Markdown-first, offline-capable personal knowledge atlas for robotics and Embodied AI. The knowledge base grows from real technical questions, not a fixed curriculum.

## v0.2 architecture

- **System overview:** a six-stage Embodied Intelligence Lifecycle with Execution ↔ Learning and system-wide feedback.
- **Core loops:** Robot Execution, Robot Learning and Engineering Improvement.
- **Canonical knowledge:** nine primary domains, one main domain per article, one canonical location per indexed topic.
- **Contextual discovery:** professional views for Data Solutions, Robot Systems Integration, Robot Intelligence and Engineering Cases.
- **Context-aware reading:** relevant section highlighted depending on entry point, with the original article kept complete.
- **No filler:** 30 secondary Lifecycle topics are architecture positions, not required Markdown pages.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the definitive model, relationships and change rules.

## Local use

Requires Python 3.9+:

    python -m pip install -r requirements.txt
    python scripts/validate_content.py
    python build.py
    python scripts/smoke_test.py

Open dist/index.html in any modern browser (also offline). A separate Embodied_AI_Atlas_v0.2.html is written outside the repository for convenient sharing.

Knowledge source: content/*.md. Registry data: content/manifest.json (articles and domains), content/architecture.json (system views and contexts), content/topics.json (canonical section topics, typed relations, contextual focus). Presentation: assets/site.js, site.css and v02.css. Build output dist/ is generated and ignored by Git.

**Add knowledge gradually:** first check whether a topic already has a canonical location. Expand the existing article/section where possible; otherwise register a new topic or Markdown article with one primary domain. Add view mappings only where the relationship adds meaning.

Old URLs such as ?page=data-recipe remain valid. New views: ?view=stage&id=04, ?view=loop&id=learning, ?view=domain&id=data, ?view=context&id=data-solutions. A contextual link such as ?page=data-recipe&context=stage%3A06 highlights relevant content without creating a second article.

## Deployment

Pushing to main triggers validation, build and GitHub Pages publication through .github/workflows/deploy-pages.yml. Pull requests run validation and smoke checks. See GITHUB_DEPLOY.md for the existing setup.

Research claims are snapshots: preserve sources, dates, model versions and unknowns. Company data holdings are not automatically training mixture weights.
