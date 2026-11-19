# GitHub maintenance and publication · GitHub 托管与更新

This repository is **Markdown-first**. GitHub contains editable source; GitHub Actions builds and publishes the static `dist/index.html` automatically.

## First-time GitHub setup (no command line required)

1. Create a GitHub repository named `embodied-ai-atlas` (public is simplest if the knowledge base is intended to be public). Do **not** upload private company documents, confidential data, or personal identifying information. A GitHub Pages site is publicly reachable even when its underlying repository is private, depending on plan/features.
2. Upload the **files and folders inside `embodied-ai-atlas/`** to the repository root, preserving hidden `.github/workflows/deploy-pages.yml`. GitHub's upload interface may not handle folder structures conveniently; Git CLI or GitHub Desktop is an alternative.
3. In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to `main`. The Actions workflow validates the Markdown, runs `python build.py`, and publishes the site.
5. Open `https://YOUR_USERNAME.github.io/embodied-ai-atlas/` (replace the username); for a project site this is the normal default URL.

## Day-to-day maintenance

- Edit an article at `content/<topic>.md` in the GitHub web editor; click Commit changes.
- For a new article, add a Markdown file and a corresponding entry to `content/manifest.json` with a unique stable `id` and appropriate `related` links.
- For a larger revision use a branch + pull request, review the diff, then merge to `main`.
- Every push to `main` triggers GitHub Actions and publishes the updated website automatically; no manual HTML upload.
- The workflow also detects missing Markdown files, duplicate IDs, and invalid internal `?page=` links.
- The generated `dist/` is intentionally ignored; it is an output, **not** the source of truth.

## Local preview

```sh
python -m pip install -r requirements.txt
python scripts/validate_content.py
python build.py
```

Open `dist/index.html` in your browser. Site HTML is fully self-contained, so GitHub Pages needs no framework server and navigation works on repository subpaths.

## Suggested conventions

- Treat `main` as the published source of truth.
- Keep stable page IDs, even if you rename the article title.
- Keep company-model claims dated, with original source links and explicit uncertainty.
- Make small revisions directly; use pull requests for structural changes.
- Once the site needs math typesetting, scalable multi-page routing, citation tooling or advanced search, consider an incremental migration to MkDocs Material, VitePress, or Starlight. No migration needed for v0.1.
