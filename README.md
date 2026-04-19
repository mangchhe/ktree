# knowledge.tree

English · [한국어](./README.ko.md)

An **open-source knowledge tree template** that grows through chained questions.
No build step — drop your Supabase keys into two HTML files and you have your own knowledge base.

**Demo**: [mangchhe.github.io/ktree](https://mangchhe.github.io/ktree)

```
Apache Kafka
  ├── Core Concepts
  │   ├── Topic · Partition · Offset · Consumer Group
  ├── Consumer Deep Dive
  │   ├── Consumer Group Protocol
  │   ├── Simple vs Group Consumer
  │   └── Ordering Guarantees
  └── ...
```

## Features

- **Hierarchical viewer** — browse Topic → Section → Concept cards with hash-based routing
- **In-browser semantic search** — match questions to concepts via Xenova/transformers (no server)
- **Markdown split editor** — Write / Preview / Split modes with bidirectional scroll sync
- **Section-level bulk editing** — edit all concepts of a section as a single Markdown document
- **Public / Private dual mode** — keep public publishing separate from private study notes
- **Revision history** — AS-IS / TO-BE diff for every concept change
- **Hierarchical Esc navigation** — form → detail → topic → home
- **Import / Export** — round-trip a topic to/from a Markdown README

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/JS · marked.js · CSS variables (dark theme) |
| Search | [@xenova/transformers](https://github.com/xenova/transformers.js) (all-MiniLM-L6-v2, runs in browser) |
| Backend | Supabase (PostgreSQL · REST · Auth · RLS) |
| Hosting | Static — GitHub Pages / Netlify / Vercel / Cloudflare Pages |

## Quick start

```bash
git clone <your-repo>
cd knowledge-tree
npx serve .
# → http://localhost:3000
```

> Without Supabase keys configured, you'll see a setup notice page.

### Use as a template

1. **Fork** or click **Use this template**
2. Create a project on [supabase.com](https://supabase.com) → run the schema & RLS SQL from [SETUP.md](./SETUP.md)
3. Replace the Supabase keys at the top of `index.html` and `admin.html`:

```js
const SUPABASE_URL = 'https://<your-project>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';
```

4. Add an admin user in Supabase Authentication → log in at `/admin` → start authoring
5. Deploy as static files to GitHub Pages / Netlify / Vercel / etc.

> See [SETUP.md](./SETUP.md) for the full schema, RLS policies, and deployment notes.

## Documentation

| File | Description |
|---|---|
| [SETUP.md](./SETUP.md) | Supabase setup · schema · deployment |
| [CONTENT_WORKFLOW.md](./CONTENT_WORKFLOW.md) | Content authoring / review / publish flow |

## License

MIT
