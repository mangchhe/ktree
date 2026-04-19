# Content Workflow

English · [한국어](./CONTENT_WORKFLOW.ko.md)

To balance content quality with speed of publishing, authoring, review, and persistence are split into three stages.

- **Stage 1 (Draft)** — the author sends a draft in the *review format*
- **Stage 2 (Review)** — the agent enriches explanations and returns a *confirmation summary*
- **Stage 3 (Apply)** — once approved, the agent produces *SQL for the database*

## Database

- **DBMS:** PostgreSQL
- **Tables:** `topics`, `sections`, `concepts`, `concept_revisions` (with `_private` suffix counterparts for Private mode)
- **ID type:** `text` (use UUID or any unique string)
- **Column name:** `title` (not `name`)

### Structure

```
Topic
│   e.g. "JavaScript", "Operating Systems", "Networking"
│   a top-level learning subject
│
└── Section [1:N]
    │   e.g. "Async programming", "Process management", "TCP/IP"
    │   chapter-level grouping within a topic
    │
    └── Concept [1:N]
        │   e.g. "Promise", "async/await", "Event loop"
        │   the actual content unit (description, level, questions, content)
        │
        └── Child Concept [parent_concept_id, optional]
                e.g. "Promise.all", "Promise.race"
                sub-concept of a parent; enables tree-shaped drill-downs
```

**Relations**

- `Topic` 1 → N `Section`
- `Section` 1 → N `Concept`
- `Concept` 0 → N `Concept` (self-reference via `parent_concept_id`)
- `Concept` also carries `topic_id` directly (so you can query by topic without joining sections)

### Schema

See [SETUP.md](./SETUP.md) for the full `CREATE TABLE` statements.

## README Import / Export

You can manage content as a Markdown README file and sync it with the database in both directions.
Editing in Markdown is more natural than hand-writing SQL, and it plays well with review and version control.

### README format (parser rules)

Topic → Section → Concept are expressed via heading levels.

````markdown
# {Topic title}

{Topic description (optional)}

## {Section title}

{Section description (optional)}

### {Concept title}

> level: basic | deep
> questions: question 1 | question 2

{Concept description}

{Concept content — detailed explanation, practical context, etc. Multi-line OK}
````

**Rules**

- `#` — Topic (exactly one per file)
- `##` — Section (many per file)
- `###` — Concept (many per section)
- A `>` blockquote directly under a Concept encodes metadata (`level`, `questions`)
- `level` values: `basic`, `deep` (omit for `NULL`)
- `questions` are `|`-separated
- Body after the blockquote becomes `description` + `content`
  - first paragraph → `description`
  - everything after → `content`
- Child concepts are expressed as `####` and auto-linked via `parent_concept_id`

**Example**

````markdown
# JavaScript

Core JavaScript concepts

## Async programming

Async patterns and runtime internals

### Promise

> level: basic
> questions: What is a Promise | Difference between then and catch

An object representing the eventual completion or failure of an async operation.

Introduced in ES6 to solve callback hell; chaining makes sequential flow and
error handling explicit.

#### Promise.all

> level: deep

Runs multiple promises in parallel and waits until all of them resolve.
````

---

### Import flow (README → DB)

```
Click ↑ Import in the admin panel
  → pick a .md file
  → preview the parsed result (section/concept counts, levels, child markers)
  → confirm to run the upsert
  → concept_revisions are auto-written
```

**Match keys (upsert)**

| Entity | Match key |
|---|---|
| Topic | `title` |
| Section | `topic_id` + `title` |
| Concept | `section_id` + `title` |

**Behavior**

- If a Topic/Section/Concept with the same title exists, `UPDATE`; otherwise `INSERT`
- Fields not present in the README (e.g. Topic `color`, `tags`, `sort_order`) are preserved
- `sort_order` follows file order (existing items keep their value; new items go to the end)
- Before import, the latest DB state is re-fetched to avoid duplicate inserts from a stale cache
- `concept_revisions` get `change_type: create | update` automatically

### Export flow (DB → README)

```
Select a topic in the admin panel, then click ↓ Export
  → the entire topic is serialized into README format
  → downloaded as {topic-slug}.md
```

- File naming: `{topic-title-kebab-case}.md`
- Emits sections and concepts in `sort_order`
- Child concepts are rendered as `####`
- Blockquote metadata is only emitted when `level` / `questions` are present

---

## 1) Author's review format

Given the template below, the agent rewrites it into explanatory prose and fills in any missing concepts.

```yaml
topic: AI
sections:
  - title: Agent
    concepts:
      - title: Agent
        summary: An AI that understands intent and takes action
        detail: 2–4 sentences of detail
      - title: Plan-Act-Observe
        summary: The plan → act → observe loop
        detail: 2–4 sentences of detail
  - title: Ontology
    concepts:
      - title: Ontology
        summary: An entity–relation–rule knowledge system
        detail: 2–4 sentences of detail
```

## 2) Agent's confirmation format

Before any SQL, the agent always confirms these first:

- Final shape: `Topic > Section > Concept`
- For each concept: `definition + why it matters + real-world context`
- Change type per item: `new / updated / unchanged`

## 3) Apply format (SQL)

- After approval, generate `upsert`-centric SQL
- `id` can come from an auto-generator (manual fixed IDs are not required)
- Include safeguards against duplicates (keyed by `title` + `section/topic`)
- Provide verification `SELECT` queries when useful

### Pre-SQL checks (DB constraints)

- `concepts.level` allowed values: `basic`, `deep`, `NULL`
- Do not use non-allowed values like `intermediate`
- Check for existing entries with the same title before insert/update

### Post-SQL verification

- Make sure `sort_order` reflects intent for topics/sections
- Verify each concept's `level`, `title`, `description`, `content`
- When needed, apply a separate policy for `concept_revisions` (create/update history)

### Revision backfill rule (important)

- Saving in `admin.html` records `concept_revisions` automatically
- Direct `INSERT/UPDATE` on `concepts` via SQL does **not** produce a revision row
- So when applying via SQL, always do one of the following:
  - New inserts: backfill `change_type = 'create'`
  - Bulk updates/cleanups: snapshot the current state (usually `change_type = 'update'`)
- Operating rule: **content SQL and revision backfill SQL should run in the same unit of work**

## Operating principles

- Treat the original/author-provided content as the primary source of truth
- The agent only enriches where needed; avoid over-expanding or inventing new names
- Write in *explanatory* prose, not bulleted memos
- Keep topic/section/concept names in the same tone as the existing repo (short, clear nouns)
