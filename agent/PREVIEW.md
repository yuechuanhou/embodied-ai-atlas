# Agent interaction preview

This development preview validates the on-site workflow before private infrastructure
or model billing is configured. It is not a live Agent. Normal `python build.py`
omits the launcher, demo code and draft-source payload; Pages uploads only `dist/`.

## Build and review

```sh
python -m pip install -r requirements-dev.txt
npm ci --ignore-scripts
python build.py
python build.py --agent-demo
npm run test:agent
```

Serve `.preview/agent-demo/` over HTTP with the supported development preview
environment. For an ordinary local checkout, `python -m http.server 8000 --directory
.preview/agent-demo` is sufficient. Opening the HTML through `file:` can show the
interface, but browser file navigation reloads the page and loses the in-memory
conversation; use HTTP to review route continuity. Crypto digest support also needs
a secure context (HTTPS or localhost). PR CI saves the preview as a review artifact.
`Atlas_Agent_Interaction_Preview.html` is a self-contained copy for visual review;
the same file-navigation limitation applies to it.

1. Open **Atlas Agent**. It starts closed and inherits the reading theme.
2. Choose **理解 VIO 与 IMU**. Citation cards contain actual build excerpts, and
   navigate to canonical articles/sections. Chat survives SPA route changes.
3. Choose **新概念演示**, or ask `AtlasDemoConcept：一个新概念`. No direct hit creates
   a simulated candidate and draft automatically. In an article, it demonstrates a
   new section/Topic; from home it demonstrates an independent article with one
   Primary Domain. This is deterministic scenario logic, not an intelligent taxonomy
   decision. It deliberately supplies no unverified technical lesson.
4. Ask `补充一个工程例子`. It revises the same candidate/proposal instead of creating
   a duplicate. Open **审阅变更** for exact file changes, placement and provenance.
5. **确认演示变更** records only a simulated approval/job; it creates no public branch,
   PR, merge or deployment. No network requests or browser persistence store chat.
6. Under **预览范围与版本**, simulate a version conflict or one failed check. Refreshing
   a proposal requires new confirmation; retry resumes the same simulated task.

Desktop uses an optional side panel and expanded two-column workbench. Narrow screens
use a modal/full-screen conversation or review surface, focus trapping, Escape and
focus return. Selected article text is attached only after an explicit click.

## Boundaries and remaining work

- Retrieval is lexical over real full article text, headings (including unregistered
  TOC sections), Topic aliases and canonical IDs. It is not semantic/vector search.
- The reading context includes Article, Topic, anchor and source-view fields. The
  navigation bridge accepts only known Topic IDs or known Article/TOC anchors.
- Simulation results never claim to have read latest main or to be deployed. The
  payload is a local build snapshot; real GitHub/Pages synchronization is stage C.
- The UI creates versioned envelopes compatible with the Python schema/digest and
  semantic gate. Tests pass both article-extension and independent-article proposals
  through the actual Python validators against the current checkout.
- The Python gate checks actual after-images, protects definitions and identities,
  runs an isolated content validation/build and rejects active rendered HTML. It
  does not authenticate a request, judge factual correctness or grant publication.
- The browser's confirmation, state machine, retries and job IDs are simulations.
  Server-enforced identity, immutable approvals, durable jobs, source fetching,
  budgets, D1 and restricted GitHub execution are still required before real use.
- Do not enter sensitive learning/work material in this development preview. The
  future authenticated private service is the intended place for those sessions.

`scripts/test_agent_preview.js` covers UI workflow/isolation, canonical navigation,
followup deduplication, schema interoperability, stale approvals, retry idempotency,
mobile focus/review, unsafe input and search-dialog coexistence.
`scripts/test_agent_changes.py` covers actual content mutation boundaries. These tests
complement the existing site and private-database suites; they are not online security
or real-device acceptance tests.
