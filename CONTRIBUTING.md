# 기여 가이드

## 새 주제 추가하기

### 1. `topics/index.json`에 항목 추가

```json
{
  "id": "my-topic",
  "title": "주제 이름",
  "description": "한 줄 설명",
  "file": "my-topic.json",
  "tags": ["backend", "database"],
  "nodeCount": 10,
  "author": "github-username"
}
```

### 2. `topics/my-topic.json` 파일 생성

```json
{
  "id": "my-topic",
  "title": "주제 이름",
  "description": "주제 설명",
  "children": [
    {
      "id": "section-1",
      "title": "섹션 이름",
      "description": "섹션 설명",
      "children": [
        {
          "id": "leaf-node",
          "title": "개념 이름",
          "level": "basic",
          "description": "한 줄 설명 (카드 뷰에서 보임)",
          "questions": [
            "이 개념으로 검색될 만한 질문 1?",
            "이 개념으로 검색될 만한 질문 2?"
          ],
          "content": "## 마크다운 형식의 상세 내용\n\n내용을 여기에 씁니다."
        }
      ]
    }
  ]
}
```

## 노드 구조 규칙

- `id`: 유일한 식별자. 영어 소문자 + 하이픈 (예: `consumer-group`)
- `title`: 카드 제목. 짧고 명확하게.
- `description`: 선택사항. 카드 제목 아래에 표시되는 부가 설명.
- `level`: 선택사항. `"basic"` 또는 `"deep"`. 입력 시 필터 바가 활성화됨.
  - `basic` — 기본 개념 및 동작 방식
  - `deep` — 내부 구현, 트레이드오프, 엣지케이스 등
- `questions`: 선택사항. 이 개념으로 검색될 만한 질문 목록 (문자열 배열).
  - 카드 하단에 표시되고, **벡터 검색 인덱스로 사용됨**
  - 질문이 없으면 `title` + `description`을 대신 임베딩
- `content`: 마크다운 형식. **리프 노드**에만 씁니다. (자식이 없는 노드)
- `children`: 하위 노드 배열. `content`와 함께 쓰면 `content`가 우선.

## 깊이 권장사항

```
루트 (1개)
  └── 카테고리 (2~5개)
        └── 개념 (여러 개)
              └── 세부 내용 (선택사항)
```

3~4단계 이하를 권장합니다. 너무 깊으면 트리가 복잡해집니다.

## content 작성 팁

```markdown
## 개념 제목

한 줄 정의.

### 언제 쓰는가

설명...

### 예시

​```
코드 또는 다이어그램
​```

### 주의사항

> 중요한 내용은 blockquote로 강조합니다.
```

표, 코드블록, 인라인 코드, 헤딩, 리스트 모두 지원합니다.

## `questions` 작성 팁

`questions`는 이 개념을 벡터 검색으로 찾을 수 있도록 도와주는 질문 목록입니다. 사용자가 실제로 검색할 법한 표현으로 작성하세요.

```json
"questions": [
  "컨슈머 그룹은 왜 필요한가?",
  "여러 컨슈머가 같은 토픽을 중복 없이 읽으려면?",
  "파티션과 컨슈머는 어떻게 매핑되나?"
]
```

- 하나의 개념에 여러 각도의 질문을 넣을수록 검색 정확도가 올라감
- 동의어나 다른 표현도 넣으면 좋음 (예: "리밸런싱", "rebalancing", "파티션 재할당")
- `questions`가 없으면 `title` + `description`으로 자동 임베딩 (정확도 낮음)

## `level` 기준

- `basic` — 개념의 정의, 용도, 기본 동작 방식
- `deep` — 내부 구현, 트레이드오프, 실패 케이스, 성능 특성

섹션 내 일부 노드에만 `level`을 붙여도 됩니다. `level`이 하나라도 있으면 필터 바가 활성화됩니다.

## PR 체크리스트

- [ ] `id` 중복 없음
- [ ] 최소 하나의 리프 노드에 `content` 있음
- [ ] `topics/index.json` 업데이트
- [ ] `questions` 항목은 의문문으로 끝나는지 확인
- [ ] 로컬에서 `npx serve .`으로 확인
