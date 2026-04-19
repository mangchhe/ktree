# 콘텐츠 운영 플로우 (작업 합의)

콘텐츠 품질과 반영 속도를 동시에 맞추기 위해, 작성/검토/반영 단계를 분리합니다.

- 1단계(작성): 작성자는 **검토용 포맷**으로 초안 전달
- 2단계(검토): 에이전트가 개념 설명을 보강한 **컨펌용 요약본** 제시
- 3단계(반영): 승인 후 **DB 반영용 SQL** 생성

## 데이터베이스

- **DBMS:** PostgreSQL
- **테이블:** topics, sections, concepts, concept_revisions (private 용 _private 접미사 테이블 별도 존재)
- **ID 타입:** text (UUID 등 사용)
- **컬럼명:** title (name 아님)

### 구조 관계도

```
Topic (주제)
│   예) "JavaScript", "운영체제", "네트워크"
│   하나의 큰 학습 주제 단위
│
└── Section (섹션) [1:N]
    │   예) "비동기 처리", "프로세스 관리", "TCP/IP"
    │   Topic을 구성하는 챕터/묶음 단위
    │
    └── Concept (개념) [1:N]
        │   예) "Promise", "async/await", "이벤트 루프"
        │   실제 학습 콘텐츠 단위 (설명, 레벨, 질문 포함)
        │
        └── Concept (자식 개념) [parent_concept_id, 선택]
                예) "Promise.all", "Promise.race"
                부모 개념의 세부 개념으로 트리 구조 가능
```

**관계 요약**

- `Topic` 1 → N `Section`
- `Section` 1 → N `Concept`
- `Concept` 0 → N `Concept` (self-referencing, parent_concept_id)
- `Concept`은 `topic_id`도 직접 보유 (section 없이 topic 기준 조회 가능)

### 스키마

```sql
CREATE TABLE public.topics (
  id text NOT NULL,
  title text NOT NULL,
  description text,
  tags ARRAY DEFAULT '{}'::text[],
  node_count integer DEFAULT 0,
  color text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT topics_pkey PRIMARY KEY (id)
);

CREATE TABLE public.topics_private (
  id text NOT NULL,
  title text NOT NULL,
  description text,
  tags ARRAY DEFAULT '{}'::text[],
  node_count integer DEFAULT 0,
  color text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT topics_private_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sections (
  id text NOT NULL,
  topic_id text NOT NULL,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sections_pkey PRIMARY KEY (id),
  CONSTRAINT sections_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);

CREATE TABLE public.sections_private (
  id text NOT NULL,
  topic_id text NOT NULL,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sections_private_pkey PRIMARY KEY (id),
  CONSTRAINT sections_private_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics_private(id)
);

CREATE TABLE public.concepts (
  id text NOT NULL,
  section_id text NOT NULL,
  topic_id text NOT NULL,
  parent_concept_id text,
  title text NOT NULL,
  description text,
  level text CHECK (level = ANY (ARRAY['basic'::text, 'deep'::text])),
  questions ARRAY DEFAULT '{}'::text[],
  content text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT concepts_pkey PRIMARY KEY (id),
  CONSTRAINT concepts_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id),
  CONSTRAINT concepts_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id),
  CONSTRAINT concepts_parent_concept_id_fkey FOREIGN KEY (parent_concept_id) REFERENCES public.concepts(id)
);

CREATE TABLE public.concepts_private (
  id text NOT NULL,
  section_id text NOT NULL,
  topic_id text NOT NULL,
  parent_concept_id text,
  title text NOT NULL,
  description text,
  level text CHECK (level = ANY (ARRAY['basic'::text, 'deep'::text])),
  questions ARRAY DEFAULT '{}'::text[],
  content text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT concepts_private_pkey PRIMARY KEY (id),
  CONSTRAINT concepts_private_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections_private(id),
  CONSTRAINT concepts_private_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics_private(id),
  CONSTRAINT concepts_private_parent_concept_id_fkey FOREIGN KEY (parent_concept_id) REFERENCES public.concepts_private(id)
);

CREATE TABLE public.concept_revisions (
  id text NOT NULL,
  concept_id text NOT NULL,
  topic_id text,
  section_id text,
  change_type text NOT NULL DEFAULT 'update'::text,
  title text,
  description text,
  level text,
  questions ARRAY,
  content text,
  changed_fields jsonb,
  changed_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT concept_revisions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.concept_revisions_private (
  id text NOT NULL,
  concept_id text NOT NULL,
  topic_id text,
  section_id text,
  change_type text NOT NULL DEFAULT 'update'::text,
  title text,
  description text,
  level text,
  questions ARRAY,
  content text,
  changed_fields jsonb,
  changed_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT concept_revisions_private_pkey PRIMARY KEY (id)
);
```

## README Import / Export

콘텐츠를 마크다운 README 파일로 관리하고, DB와 양방향으로 동기화합니다.
SQL을 직접 작성하는 것보다 README로 편집하는 것이 더 자연스럽고 리뷰/버전 관리도 용이합니다.

### README 파일 포맷 (파싱 기준)

헤딩 계층으로 Topic → Section → Concept 구조를 표현합니다.

```markdown
# {Topic title}

{Topic description (선택)}

## {Section title}

{Section description (선택)}

### {Concept title}

> level: basic | deep
> questions: 질문1 | 질문2

{Concept description}

{Concept content — 상세 설명, 실무 맥락 등. 여러 줄 가능}
```

**규칙**

- `#` — Topic (파일 당 1개)
- `##` — Section (여러 개 가능)
- `###` — Concept (각 Section 아래 여러 개 가능)
- Concept 바로 아래 `>` blockquote로 메타 표기 (`level`, `questions`)
- `level` 허용값: `basic`, `deep` (없으면 NULL)
- `questions`는 `|` 구분자로 여러 개 입력
- description과 content는 blockquote 이후의 본문으로 처리
  - 첫 번째 단락 → `description`
  - 이후 본문 전체 → `content`
- 자식 Concept은 `####`으로 표현 (parent_concept_id 자동 연결)

**예시**

```markdown
# JavaScript

자바스크립트 핵심 개념 모음

## 비동기 처리

비동기 프로그래밍 패턴과 런타임 동작 원리

### Promise

> level: basic
> questions: Promise란 무엇인가 | then과 catch의 차이는

비동기 작업의 최종 완료 또는 실패를 나타내는 객체.

콜백 지옥을 해결하기 위해 ES6에서 도입됐으며, 체이닝을 통해 순차 처리와
에러 핸들링을 명시적으로 표현할 수 있다.

#### Promise.all

> level: deep

여러 Promise를 병렬로 실행하고 모두 완료될 때까지 기다리는 메서드.
```

---

### Import 흐름 (README → DB)

```
README.md 파일 제공
  → 에이전트가 파싱 및 컨펌용 요약본 제시 (기존 2단계 동일)
  → 승인 후 upsert SQL 생성
  → concept_revisions 백필 SQL 함께 생성
```

- 기존 동일 title의 concept이 있으면 수정(`UPDATE`), 없으면 신규(`INSERT`)
- Topic/Section도 없으면 함께 생성
- `sort_order`는 파일 내 등장 순서 기준으로 자동 부여

### Export 흐름 (DB → README)

```
토픽 ID 또는 title 지정
  → 에이전트가 SELECT 쿼리로 데이터 조회 요청
  → 조회 결과를 README 포맷으로 변환하여 제공
```

- 파일명 컨벤션: `{topic-title-kebab-case}.md`
- sort_order 순서대로 Section, Concept 나열
- 자식 Concept은 `####`으로 들여쓰기

---

## 1) 작성자가 주는 검토용 포맷

아래 템플릿으로 주면, 에이전트가 설명형으로 정리하고 누락 개념을 보강합니다.

```yaml
topic: AI
sections:
  - title: Agent
    concepts:
      - title: Agent
        summary: 의도를 파악하고 실행까지 수행하는 AI
        detail: 2~4문장 설명
      - title: Plan-Act-Observe
        summary: 계획-실행-관찰 루프
        detail: 2~4문장 설명
  - title: Ontology
    concepts:
      - title: Ontology
        summary: 개체-관계-규칙 지식 체계
        detail: 2~4문장 설명
```

## 2) 에이전트가 주는 컨펌용 포맷

SQL 전에 반드시 아래 항목으로 먼저 확인합니다.

- 최종 구조: `Topic > Section > Concept`
- 각 Concept: `정의(무엇인지) + 중요성(왜 필요한지) + 실무 맥락`
- 변경 유형 표기: `신규 / 수정 / 유지`

## 3) 최종 반영 포맷 (SQL)

- 승인 후 `upsert` 중심 SQL 생성
- `id`는 자동 생성 로직 사용 가능 (수동 고정 ID 강제하지 않음)
- 중복 입력 방지 조건 포함 (`title` + `section/topic` 기준)
- 필요 시 검증용 `SELECT` 쿼리 함께 제공

### SQL 생성 전 필수 체크 (DB 제약)

- `concepts.level` 허용값: `basic`, `deep`, `NULL`
- `intermediate` 같은 비허용 값 사용 금지
- 신규 삽입/수정 전, 기존 동일 제목 데이터 존재 여부 확인

### SQL 실행 후 검증 체크

- 토픽/섹션 정렬(`sort_order`)이 의도대로 반영되었는지 확인
- 컨셉별 `level`, `title`, `description`, `content` 반영 확인
- 필요 시 `concept_revisions` 기록 정책(생성/수정 이력) 별도 적용

### Revision 백필 규칙 (중요)

- `admin.html`에서 저장하면 `concept_revisions`가 자동 기록됨
- SQL로 `concepts`를 직접 `INSERT/UPDATE`하면 revision이 자동 생성되지 않음
- 따라서 SQL 반영 시 아래 중 하나를 반드시 같이 수행
  - 신규 반영: `change_type = 'create'` 백필
  - 대량 수정/정리: 현재 상태 `snapshot`(보통 `change_type = 'update'`) 기록
- 운영 원칙: **콘텐츠 반영 SQL과 revision 백필 SQL을 같은 작업 단위로 실행**

## 운영 원칙

- 원문/사용자 제공 내용을 1순위 기준으로 사용
- 에이전트는 필요한 맥락만 보강하되, 과도한 확장/창작 네이밍은 지양
- 설명은 메모형이 아니라 **개념 설명형**으로 작성
- 토픽/섹션/컨셉 이름은 기존 저장소 톤(짧고 명확한 명사형)에 맞춤
