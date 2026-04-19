# knowledge.tree

[English](../README.md) · 한국어

꼬리물기 질문으로 성장하는 **오픈소스 지식 트리 템플릿**.
빌드 과정 없이 HTML 2개 + Supabase 키만 넣으면 바로 당신만의 지식 정리 사이트가 됩니다.

**데모**: [mangchhe.github.io/ktree](https://mangchhe.github.io/ktree)

```
Apache Kafka
  ├── 핵심 개념
  │   ├── Topic · Partition · Offset · Consumer Group
  ├── Consumer 심화
  │   ├── Consumer Group 프로토콜
  │   ├── Simple Consumer vs Group Consumer
  │   └── 순서 보장
  └── ...
```

## 주요 기능

- **계층형 지식 뷰어** — 주제 → 섹션 → 개념 카드로 탐색, 해시 기반 라우팅
- **브라우저 내 시맨틱 검색** — Xenova/transformers 로 질문 → 관련 개념 매칭 (서버 불필요)
- **마크다운 Split 에디터** — 어드민에서 Write/Preview/Split 모드, 양방향 스크롤 싱크
- **섹션 단위 일괄 편집** — 섹션의 모든 개념을 하나의 마크다운으로 편집·저장
- **Public / Private 이중 모드** — 공개용 / 비공개 학습 기록을 같은 코드로 분리
- **Revision 이력** — 개념 변경 시 AS-IS / TO-BE 비교
- **Esc 계층 내비게이션** — 폼 → 상세 → 토픽 → 홈 순으로 뒤로가기
- **Import / Export** — README 마크다운으로 주제 가져오기·내보내기

## 기술 스택

| Layer | Stack |
|---|---|
| 프론트엔드 | Vanilla HTML/JS · marked.js · CSS 변수 다크 테마 |
| 검색 | [@xenova/transformers](https://github.com/xenova/transformers.js) (all-MiniLM-L6-v2, 브라우저 실행) |
| 백엔드 | Supabase (PostgreSQL · REST · Auth · RLS) |
| 호스팅 | 정적 파일 — GitHub Pages / Netlify / Vercel / Cloudflare Pages |

## 빠른 시작

```bash
git clone <your-repo>
cd knowledge-tree
npx serve .
# → http://localhost:3000
```

> Supabase 키를 설정하지 않으면 셋업 안내 페이지가 표시됩니다.

### 템플릿으로 사용하기

1. 이 저장소 **Fork** 또는 **Use this template**
2. [supabase.com](https://supabase.com) 에서 프로젝트 생성 → [SETUP.md](./SETUP.md)의 스키마·RLS SQL 실행
3. `index.html`과 `admin.html` 상단 Supabase 키 교체:

```js
const SUPABASE_URL = 'https://<your-project>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';
```

4. Supabase Authentication에서 관리자 계정 추가 → `/admin`에서 로그인 → 콘텐츠 작성
5. GitHub Pages / Netlify / Vercel 등에 정적 배포

> 자세한 셋업·마이그레이션·RLS 정책은 [SETUP.md](./SETUP.md) 참고.

## 문서

| 파일 | 설명 |
|---|---|
| [SETUP.md](./SETUP.md) | Supabase 설정 · 스키마 · 배포 |
| [CONTENT_WORKFLOW.md](./CONTENT_WORKFLOW.md) | 콘텐츠 작성 / 검토 / DB 반영 플로우 |

## 라이선스

MIT
