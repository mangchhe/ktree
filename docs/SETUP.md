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
├── challenge.html          # Challenge check-in page
├── challenge-admin.html    # Challenge settlement dashboard
├── docs/
│   ├── SETUP.md            # This file
│   └── CHALLENGE_SETUP.ko.md
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

#### 3-1. user_access table (access control)

```sql
-- user_access: maps user emails to access_type ('private', 'project_x', etc.)
CREATE TABLE public.user_access (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_email text NOT NULL,
  access_type text NOT NULL,
  granted_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_email, access_type)
);
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

-- authenticated users can only read their own access rows
CREATE POLICY "read_own_access" ON public.user_access
  FOR SELECT TO authenticated
  USING (user_email = auth.jwt()->>'email');

-- only service_role (server-side) can insert/update/delete access grants
-- manage user access from Supabase Dashboard → Table Editor
```

#### 3-2. Table RLS policies

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

-- private: only users with access_type='private' in user_access can read/write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics_private','sections_private','concepts_private','concept_revisions_private'] LOOP
    EXECUTE format(
      'CREATE POLICY "access_ctrl_%1$s" ON public.%1$I FOR ALL TO authenticated
       USING (EXISTS (
         SELECT 1 FROM public.user_access
         WHERE user_email = auth.jwt()->>''email''
         AND access_type = ''private''
       ))
       WITH CHECK (EXISTS (
         SELECT 1 FROM public.user_access
         WHERE user_email = auth.jwt()->>''email''
         AND access_type = ''private''
       ));', t);
  END LOOP;
END $$;
```

#### 3-3. Adding a new shared section (e.g. "project_x")

```sql
-- 1. Create tables (same structure as private)
CREATE TABLE public.topics_project_x   (LIKE public.topics   INCLUDING ALL);
CREATE TABLE public.sections_project_x (
  id text PRIMARY KEY,
  topic_id text NOT NULL REFERENCES public.topics_project_x(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.concepts_project_x (
  id text PRIMARY KEY,
  section_id text NOT NULL REFERENCES public.sections_project_x(id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES public.topics_project_x(id) ON DELETE CASCADE,
  parent_concept_id text REFERENCES public.concepts_project_x(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  level text CHECK (level IN ('basic', 'deep')),
  questions text[] DEFAULT '{}',
  content text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.concept_revisions_project_x (LIKE public.concept_revisions INCLUDING ALL);

-- 2. Enable RLS
ALTER TABLE public.topics_project_x              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections_project_x            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts_project_x            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_revisions_project_x   ENABLE ROW LEVEL SECURITY;

-- 3. Create access policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics_project_x','sections_project_x','concepts_project_x','concept_revisions_project_x'] LOOP
    EXECUTE format(
      'CREATE POLICY "access_ctrl_%1$s" ON public.%1$I FOR ALL TO authenticated
       USING (EXISTS (
         SELECT 1 FROM public.user_access
         WHERE user_email = auth.jwt()->>''email''
         AND access_type = ''project_x''
       ))
       WITH CHECK (EXISTS (
         SELECT 1 FROM public.user_access
         WHERE user_email = auth.jwt()->>''email''
         AND access_type = ''project_x''
       ));', t);
  END LOOP;
END $$;

-- 4. Grant access to a user
INSERT INTO public.user_access (user_email, access_type, granted_by)
VALUES ('user@example.com', 'project_x', 'admin@example.com');
```

### 4. Access types reference

| access_type | 대상 | 설명 |
|---|---|---|
| `admin` | `admin.html` 진입 권한 | 이 권한이 있어야 어드민 페이지 접근 가능 |
| `private` | `topics_private` 등 | 로그인된 특정 유저만 접근 가능한 기본 비공개 섹션 |
| `pathn` (예시) | `topics_pathn` 등 | 특정 프로젝트 전용 섹션, 초대된 유저만 접근 |

> `admin` 타입은 모드 스위처에 표시되지 않으며, Admin 버튼 노출 여부만 제어합니다.

### 5. Create an admin account

Dashboard → **Authentication → Users → Add user**, then create an email/password account.

After creating the account, grant admin access:

```sql
INSERT INTO public.user_access (user_email, access_type, granted_by)
VALUES ('your@email.com', 'admin', 'admin');
```

### 6. Drop the keys into the code

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
