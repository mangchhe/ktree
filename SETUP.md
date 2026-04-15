# 셋업 가이드

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
├── CONTRIBUTING.md         # 기여 가이드
├── .gitignore
├── topics/                 # JSON fallback 데이터 (Supabase 없을 때)
│   ├── index.json
│   ├── kafka.json
│   └── contents/kafka/*.md
├── migrate-to-supabase.mjs # 마이그레이션 스크립트 (git 제외)
└── supabase-schema.sql     # DB 스키마 (git 제외)
```

## Supabase 설정 (최초 1회)

### 1. 프로젝트 생성

1. [supabase.com](https://supabase.com) → New project → Region: Seoul
2. **Settings → API** 에서 메모:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...`
   - **service_role key**: `eyJhbGci...` (마이그레이션용, 절대 공개 금지)

### 2. 테이블 생성

Supabase Dashboard → **SQL Editor** → `supabase-schema.sql` 전체 붙여넣기 → Run

DB 구조:
- `topics` — 최상위 주제 (Kafka, Redis, Docker)
- `sections` — 주제 하위 섹션
- `concepts` — 리프 노드 (실제 개념 카드)
- RLS: 읽기는 공개, 쓰기는 인증된 사용자만

### 3. 관리자 계정 생성

Dashboard → **Authentication** → **Users** → **Add user** (이메일/비밀번호)

### 4. 코드에 키 넣기

`index.html`과 `admin.html`에서:
```js
const SUPABASE_URL = 'https://실제값.supabase.co';
const SUPABASE_ANON_KEY = '실제_anon_key';
```
> anon key는 프론트엔드 노출용으로 설계됨. RLS가 접근 제어.

### 5. 기존 데이터 마이그레이션

```bash
npm install @supabase/supabase-js
```

`migrate-to-supabase.mjs`에서 URL과 **service_role key** 채운 뒤:
```bash
node migrate-to-supabase.mjs
```

### 6. 타임스탬프 컬럼 추가 (2025-04-15)

테이블에 created_at 컬럼 추가 (기존 데이터는 프로젝트 시작일로 설정):

```sql
-- public 테이블
ALTER TABLE topics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE sections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 기존 데이터 created_at을 프로젝트 시작일(Apr 13)로 설정
UPDATE topics SET created_at = '2025-04-13 00:00:00+09' WHERE created_at IS NULL;
UPDATE sections SET created_at = '2025-04-13 00:00:00+09' WHERE created_at IS NULL;
UPDATE concepts SET created_at = '2025-04-13 00:00:00+09' WHERE created_at IS NULL;

-- private 테이블
ALTER TABLE topics_private ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE sections_private ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE concepts_private ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 기존 데이터 created_at을 프로젝트 시작일(Apr 13)로 설정
UPDATE topics_private SET created_at = '2025-04-13 00:00:00+09' WHERE created_at IS NULL;
UPDATE sections_private SET created_at = '2025-04-13 00:00:00+09' WHERE created_at IS NULL;
UPDATE concepts_private SET created_at = '2025-04-13 00:00:00+09' WHERE created_at IS NULL;
```

Supabase Dashboard → **SQL Editor** → 위 쿼리 실행 → Run

## 배포 (TODO)

정적 파일만 배포하면 됨. 아래 중 하나 선택:

| 서비스 | 방법 |
|---|---|
| **GitHub Pages** | Settings → Pages → main branch, / root |
| **Netlify** | 폴더 드래그앤드롭 또는 GitHub 연동 |
| **Vercel** | GitHub 연동, Framework: Other |
| **Cloudflare Pages** | GitHub 연동, 빌드 커맨드 없음 |

배포 후 `https://{도메인}/admin.html`에서 로그인하여 데이터 관리.

## 키 관련 참고

| 키 | 위치 | 노출 | 위험? |
|---|---|---|---|
| anon key | index.html, admin.html | O | 괜찮음 (RLS로 제한) |
| service_role key | migrate-to-supabase.mjs | X (git 제외) | 위험 (절대 공개 금지) |
