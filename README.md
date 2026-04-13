# knowledge.tree 🌱

꼬리물기 질문으로 성장하는 지식 트리. 공부하면서 생긴 궁금증을 구조화해서 공유합니다.

```
Apache Kafka
  ├── 핵심 개념
  │   ├── Topic
  │   ├── Partition
  │   ├── Offset
  │   └── Consumer Group
  ├── Consumer 심화
  │   ├── Consumer Group 프로토콜
  │   ├── Simple Consumer vs Group Consumer
  │   ├── 파티션:Consumer 비율
  │   └── 순서 보장
  └── ...
```

## 주요 기능

- **지식 트리 뷰어** — 주제 → 섹션 → 개념 카드 구조로 탐색
- **시맨틱 검색** — 브라우저 내 벡터 검색 (질문으로 개념 찾기)
- **마크다운 콘텐츠** — 개념마다 마크다운으로 상세 설명
- **관리 페이지** — 로그인 후 CRUD + 마크다운 에디터로 콘텐츠 관리

## 기술 스택

- **프론트엔드**: Vanilla JS · marked.js · CSS 변수 다크 테마
- **검색**: Xenova/transformers (all-MiniLM-L6-v2, 브라우저 내 실행)
- **백엔드**: Supabase (PostgreSQL + REST API + Auth + RLS)

## 로컬 실행

```bash
npx serve .
# → http://localhost:3000
```

> 셋업, Supabase 연동, 배포 등 자세한 내용은 [SETUP.md](./SETUP.md) 참고
