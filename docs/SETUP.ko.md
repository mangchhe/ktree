# 셋업 가이드

[English](./SETUP.md) · 한국어

## 아키텍처

```
[정적 호스팅]                       [Supabase (무료)]
 index.html  ──── REST API ────→   PostgreSQL DB
 admin.html                         Auth (이메일/비밀번호)
 (HTML/CSS/JS)                      RLS (Row Level Security)
```

## 파일 구조

```
├── index.html              # 메인 페이지 (지식 트리 뷰어)
├── admin.html              # 관리 페이지 (CRUD + 마크다운 에디터)
├── SETUP.md                # 이 파일
├── CONTENT_WORKFLOW.md     # 콘텐츠 운영 가이드
└── .gitignore
```

## Supabase 설정 (최초 1회)

### 1. 프로젝트 생성

1. [supabase.com](https://supabase.com) → **New project**
2. **Settings → API** 에서 값 확인:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` (프론트엔드에서 사용)

### 2. 스키마 생성

Supabase Dashboard → **SQL Editor** → New query → 아래 SQL 전체 붙여넣기 → Run

```sql
-- topics (최상위 주제)
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

-- sections (주제 하위 섹션)
CREATE TABLE public.sections (
  id text PRIMARY KEY,
  topic_id text NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- concepts (실제 개념 카드)
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

-- concept_revisions (변경 이력)
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

-- private 테이블 (비공개 모드, 구조 동일)
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

### 3. RLS (Row Level Security) 정책

```sql
-- 모든 테이블 RLS 활성화
ALTER TABLE public.topics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_revisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics_private              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections_private            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts_private            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_revisions_private   ENABLE ROW LEVEL SECURITY;

-- public: 누구나 읽기, 인증된 사용자만 쓰기
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics','sections','concepts','concept_revisions'] LOOP
    EXECUTE format('CREATE POLICY "public_read_%1$s"  ON public.%1$I FOR SELECT USING (true);', t);
    EXECUTE format('CREATE POLICY "auth_write_%1$s"   ON public.%1$I FOR ALL    TO authenticated USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- private: 인증된 사용자만 읽기·쓰기
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics_private','sections_private','concepts_private','concept_revisions_private'] LOOP
    EXECUTE format('CREATE POLICY "auth_all_%1$s" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;
```

### 4. 관리자 계정 생성

Dashboard → **Authentication → Users → Add user** 로 이메일/비밀번호 계정 생성.

### 5. 코드에 키 넣기

`index.html` 과 `admin.html` 상단:

```js
const SUPABASE_URL = 'https://<your-project>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';
```

> anon key는 프론트엔드 노출용입니다. 실제 접근 제어는 RLS가 담당합니다.

## 배포

정적 파일만 배포하면 됨. 아래 중 하나 선택:

| 서비스 | 방법 |
|---|---|
| **GitHub Pages** | Settings → Pages → main branch, / root |
| **Netlify** | 폴더 드래그앤드롭 또는 GitHub 연동 |
| **Vercel** | GitHub 연동, Framework: Other |
| **Cloudflare Pages** | GitHub 연동, 빌드 커맨드 없음 |

배포 후 `https://{도메인}/admin.html`에서 로그인하여 데이터 관리.

## 키 관련 참고

- **anon key** — `index.html`, `admin.html` 에 직접 구현. 프론트엔드 노출용으로 설계되었으며 RLS가 접근을 제한합니다.
- **service_role key** — 어디에도 사용하지 않습니다. 모든 RLS를 우회하므로 반드시 서버측에서만 사용해야 합니다.
