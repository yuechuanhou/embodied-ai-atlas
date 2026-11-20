# Embodied AI Atlas — Architecture Specification v0.3

> System-centric · Knowledge-driven · Context-aware

This is the **canonical architectural contract** for the site. It defines system logic, knowledge identity, relations, navigation and evolution rules. It does **not** prescribe a curriculum or require empty articles to fill a taxonomy.

## 1. Architectural invariants

1. A Knowledge Topic has one stable ID and exactly one canonical location (an article or a section).
2. A canonical article has exactly one primary knowledge domain. Other contexts only link back to it.
3. Lifecycle, Core Loops, Domains and Contexts are **views** onto the same knowledge, not duplicate content trees.
4. Contextual Focus may highlight a section and explain its relevance, but does not hide or copy the complete Markdown article.
5. Lifecycle expresses system relationships, not a mandatory waterfall development process.
6. Real-world feedback can improve requirements, hardware, execution, data/models, or integration. It is not automatically a data-collection loop.
7. The 30 second-level Lifecycle topics are stable conceptual slots, not an article backlog.
8. A change in personal employment or current learning interests must not force rearrangement of authoritative knowledge.
9. Preserve article URLs and topic identities when content grows or splits.

## 2. System model

| Stage | System role |
| --- | --- |
| 01 Tasks & Requirements | Define robot tasks, environment, capability goals, constraints and acceptance criteria. |
| 02 Robot Embodiment & Architecture | Define robot mechanisms, actuators, sensors, computing and interfaces. |
| 03 Perception & Action | Perceive, estimate, plan, control and physically interact. |
| 04 Data & Learning | Collect and curate data, train and refine robot intelligence. |
| 05 System Integration & Operations | Integrate components, coordinate timing, deploy runtime services and diagnose faults. |
| 06 Evaluation, Deployment & Feedback | Verify requirements, evaluate closed-loop performance and drive improvement. |

Conceptual map: **01 → 02 → {03 ↔ 04} → 05 → 06 ↺ 01–05**. This is a map of relations, not strict sequencing: Engineering integration and V&V begin early. Execution and Learning both influence each other.

Each Stage has five secondary topics defined in content/architecture.json. Topics can be empty while retaining an explicit conceptual place.

### Three feedback mechanisms

- **Robot Execution:** Sense → Estimate → Decide/Plan → Control/Act → Observe/Recover. Feedback updates the robot's next state/action.
- **Robot Learning:** Collect → Process/Curate → Train → Evaluate → Deploy/Collect. Feedback changes data choices, training and policies.
- **Engineering Improvement:** Specify → Architect/Design → Integrate → Verify/Validate → Diagnose/Improve. Feedback changes requirements, architecture, interfaces and implementation.

Loops and Stages are many-to-many. Engineering spans all six Stages rather than being confined to Stage 05.

## 3. Knowledge model

**Topic**: a stable concept ID. **Article**: a Markdown content file and historical page ID. **Section**: a stable heading within an article. A Topic owns one canonical location; a single Article may contain multiple interrelated Topics. E.g. the existing geometry article contains URDF, TF, FK and IK; those concepts can be indexed separately without duplicating paragraphs.

**Nine domains**: Foundations; Robot Systems; Perception & Estimation; Motion & Control; Embodied Data; Robot Learning; Systems Engineering; Evaluation & Deployment; Industry & Research.

Reference (overview, glossary, reading list, maintenance) is an auxiliary site section and does not count as a tenth technical domain. Featured industry content must remain the same D09 research articles, not a parallel copy.

Assign articles by **the mechanism primarily explained**, not by the Lifecycle stage or employer where the topic was encountered. If a Topic is split into a new article later, keep its Topic ID and update its canonical location. Preserve or redirect existing article links.

### Technical relations

| Relation | Direction / interpretation |
| --- | --- |
| depends_on | Directed: A relies on B conceptually or technically |
| part_of | Directed: A is a component of B |
| enables | Directed: A enables a capability or method B |
| compares_with | Symmetric technical comparison, not equivalence |
| illustrated_by | Directed: A is illustrated by research or an engineering case |
| related | Conservative legacy association where no stronger relation is justified |

Incoming reverse labels are derived from the single stored edge. Sharing a Stage or Context does not by itself imply depends_on. Prefer a small number of grounded edges over dense arbitrary connections.

### Knowledge-to-view mapping

Stages, Loop steps and professional Contexts reference canonical article IDs. A specific Context Focus optionally records a focus heading and a brief reason. It never stores a duplicate explanation. A direct article or search visit shows the complete default version.

## 4. Navigation contract

The homepage gives the Lifecycle the main visual priority, including 03 ↔ 04 and the feedback from 06 to 01–05. Below that are three Loops, nine Domains, professional Contexts and Research/Reference.

- **Stage Overview**: responsibility, five secondary topics, existing knowledge links, cross-stage and cross-loop relationships.
- **Loop Overview**: ordered technical mechanism, return feedback, Stage mappings and linked existing articles.
- **Domain Index**: articles with this single primary domain; optional Topic links to sections inside existing articles.
- **Context Index**: cross-domain links for Data & AI Solutions, Robot Systems Integration, Robot Intelligence and Engineering Cases.
- **Canonical Article**: full Markdown, optional contextual focus, stable TOC, typed relations, reverse links, and system connections.

Navigation URL examples: ?view=stage&id=04 ; ?view=loop&id=learning ; ?view=domain&id=data ; ?view=context&id=robot-integration ; ?page=data-recipe&context=stage%3A06. Direct article URLs retain the old ?page=ID format. Stable slug headings are supplemented with legacy section-N aliases.

Only show links to content already present. Empty second-level themes can remain visible as architecture labels without generating placeholder articles.

## 5. Code and source of truth

- content/manifest.json: article IDs, one primary domain, page metadata and legacy related links.
- content/architecture.json: six stages, thirty secondary topics, three feedback loops, professional contexts and view mappings.
- content/topics.json: section-level canonical topics, typed relations and Context Focus mapping.
- content/*.md: authoritative technical prose, never copied into a view.
- build.py: resolves stable headings and combines data into offline index.html.
- assets/site.js, assets/site.css and assets/v02.css: presentation and client-side navigation only.
- scripts/validate_content.py and scripts/smoke_test.py: ID, reference, focus and build contract checks.

Content rules: first search for an existing Topic, then extend it or create a new one in the most appropriate Domain. Add only meaningful relations and contextual links. Add secondary topics as needed, without restructuring the six-stage system map. Keep technical citations traceable by model version and publication date.

## 6. v0.2 acceptance

- Interactive six-stage Lifecycle diagram and feedback statement.
- Three actual Loop views with linked existing articles.
- Nine unique primary-domain archives plus auxiliary Reference.
- Cross-domain professional Context views that never copy text.
- Topic-to-article/section canonical mappings and derived backlinks.
- Contextual reading emphasis without hiding full content.
- Existing 26 articles, original Markdown and historic article URLs preserved.
- Stable heading anchors alongside legacy section-N aliases.
- Data validation, static build, JS syntax checks and GitHub Pages deployment.

New educational content is intentionally **outside v0.2 scope**.

## 7. Relationship and identity maintenance

- Author Stage–Loop membership only in `architecture.json` → `loops[].stages`. The build derives each Stage's `loops` list; source Stage objects must not duplicate it.
- `content/anchors.json` freezes identities for registered Topic and Focus headings. When renaming a heading, update its heading lookup while keeping its `id`; retain additional historic slugs in `aliases`. The build also emits the current title slug and legacy `section-N` aliases.
- Same-article Topic relations are valid and visible. Relation UI names both the subject and object and derives incoming labels. Legacy reciprocal associations are deduplicated; stronger typed relations take display priority over broad article associations.
- `scripts/legacy_articles.json` protects historic article IDs while allowing new articles. Tests must not fix the total article count at 26.

## 8. Reading and navigation behavior

- Breadcrumbs express the canonical path: Atlas → primary Domain → Article. Entry Stage, Loop or professional Context stays in a separate source/focus banner, never as an alternative content parent.
- Explicit Topic/heading links take focus priority; an authored contextual focus is secondary. Default visits retain the complete article. A normal contextual visit starts at the article header and offers an explicit section jump.
- Desktop navigation starts collapsed and can release its entire column. `atlasSidebarCollapsed` stores the user's subsequent local preference. Mobile navigation starts closed, traps focus while open and supports Escape/scrim closing. Navigation group state lasts for the current session.
- Source return links restore the source view's position within the session; browser Back/Forward restore each history entry's position. Article footers link related knowledge and the Domain rather than a global article sequence.
- The right-hand article TOC becomes a disclosure above the text when space is limited. Search returns Article and section Topic results, with plain-text matching and Topic/heading aliases.
- Dialogs manage focus, inert backgrounds and return focus to their opener. Search Enter selection is scoped to its input; native link/button activation remains intact.

## 9. v0.3 presentation and entry references

- The six-stage topology, three Loops, nine Domains and four Contexts retain their IDs and roles. The homepage uses measured SVG connectors behind normal HTML links: branches/merges, Execution ↔ Learning, and one feedback return to a visibly bracketed Stage 01–05 group. Five feedback destinations remain part of the model; their default visual representation is aggregated. Cross-cutting engineering/validation use a quiet caption rather than extra Stages.
- `assets/lifecycle.css` owns the lightweight homepage map: no enclosing panel, short Chinese subtitles, restrained node borders and one return-path label. Stage pages retain the full questions and individual cross-stage connections.
- A view's `articles` array accepts an article ID or an object with exactly one of `article` / `topic` and an optional `reason`. The build resolves it into derived `entries` and an article-ID projection for existing navigation. Never maintain those two derived forms in source.
- Stage Topic entries can point directly to section Topics. A reference does not imply a complete treatment of the Stage theme; coverage notes can explicitly identify remaining gaps.
- `#domains` is the homepage's complete Domain overview. Loop overviews link to stable `#loop-step-ID` sections.
- Tiffany-inspired accents use `#81d8d0` for emphasis and a deeper `#08787e` for light-theme links. Neutral cool surfaces and graphite text keep the reading interface restrained. Dark-theme accents retain the lighter blue. Text palette contrast is checked against both reading surfaces.
