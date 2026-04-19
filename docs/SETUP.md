# Setup Guide

English · [한국어](./SETUP.ko.md)

## Architecture

```
[Static hosting]                    [Supabase (free tier)]
 index.html  ──── REST API ────→    PostgreSQL DB
 admin.html                         Auth (email/password)
 (HTML/CSS/JS)                      RLS (Row Level Security)
```

## File layout

```
├── index.html              # Main page (knowledge tree viewer)
├── admin.html              # Admin page (CRUD + markdown editor)
├── SETUP.md                # This file
├── CONTENT_WORKFLOW.md     # Content authoring guide
└── .gitignore
```

## Supabase setup (one-time)

### 1. Create a project

1. [supabase.com](https://supabase.com) → **New project**
2. Go to **Settings → API** and note:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` (used by the frontend)

### 2. Create the schema

Supabase Dashboard → **SQL Editor → New query** → paste the SQL below → Run

```sql
-- topics (top-level subjects)
CREATE TABLE public.topics (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  tags text[] DEFAULT '{}',
  node_count integer DEFAULT 0,
  color text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- sections (children of a topic)
CREATE TABLE public.sections (
  id text PRIMARY KEY,
  topic_id text NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- concepts (the actual knowledge cards)
CREATE TABLE public.concepts (
  id text PRIMARY KEY,
  section_id text NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  parent_concept_id text REFERENCES public.concepts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  level text CHECK (level IN ('basic', 'deep')),
  questions text[] DEFAULT '{}',
  content text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- concept_revisions (change history)
CREATE TABLE public.concept_revisions (
  id text PRIMARY KEY,
  concept_id text NOT NULL,
  topic_id text,
  section_id text,
  change_type text NOT NULL DEFAULT 'update',  -- create | update | delete
  title text,
  description text,
  level text,
  questions text[],
  content text,
  changed_fields jsonb,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_concept_revisions_concept_id_created_at
  ON public.concept_revisions (concept_id, created_at DESC);

-- private tables (same structure, used for the Private mode)
CREATE TABLE public.topics_private   (LIKE public.topics   INCLUDING ALL);
CREATE TABLE public.sections_private (
  id text PRIMARY KEY,
  topic_id text NOT NULL REFERENCES public.topics_private(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.concepts_private (
  id text PRIMARY KEY,
  section_id text NOT NULL REFERENCES public.sections_private(id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES public.topics_private(id) ON DELETE CASCADE,
  parent_concept_id text REFERENCES public.concepts_private(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  level text CHECK (level IN ('basic', 'deep')),
  questions text[] DEFAULT '{}',
  content text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.concept_revisions_private (LIKE public.concept_revisions INCLUDING ALL);
```

### 3. RLS (Row Level Security) policies

```sql
-- Enable RLS on every table
ALTER TABLE public.topics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_revisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics_private              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections_private            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts_private            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_revisions_private   ENABLE ROW LEVEL SECURITY;

-- public: anyone can read, only authenticated users can write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics','sections','concepts','concept_revisions'] LOOP
    EXECUTE format('CREATE POLICY "public_read_%1$s"  ON public.%1$I FOR SELECT USING (true);', t);
    EXECUTE format('CREATE POLICY "auth_write_%1$s"   ON public.%1$I FOR ALL    TO authenticated USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- private: authenticated users only (for both read and write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics_private','sections_private','concepts_private','concept_revisions_private'] LOOP
    EXECUTE format('CREATE POLICY "auth_all_%1$s" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;
```

### 4. Create an admin account

Dashboard → **Authentication → Users → Add user**, then create an email/password account.

### 5. Drop the keys into the code

Top of `index.html` and `admin.html`:

```js
const SUPABASE_URL = 'https://<your-project>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';
```

> The anon key is meant to be exposed on the frontend; access control is enforced by RLS.

## Deployment

Static files only — pick any of:

| Service | How |
|---|---|
| **GitHub Pages** | Settings → Pages → main branch, `/` root |
| **Netlify** | Drag the folder, or connect the repo |
| **Vercel** | Connect the repo, Framework: Other |
| **Cloudflare Pages** | Connect the repo, no build command |

After deployment, log into `https://{your-domain}/admin.html` to manage content.

## Key reference

- **anon key** — embedded in `index.html` and `admin.html`. Safe to expose; RLS restricts access.
- **service_role key** — not used anywhere in this project. It bypasses all RLS, so never put it in client-side code.
