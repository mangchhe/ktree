---
name: eng-pack
description: ktree English 밤 보급. 상황 대화 장면 3~5개와 뉴스 기사 1건을 만들고, 어휘까지 뽑아 오늘 판을 세운다. 사용자가 /eng-pack 이라고 하거나 "영어 보급", "장면 만들어줘", "오늘 판 채워줘"라고 할 때, 또는 새벽 launchd 로 무인 실행.
---

# /eng-pack — 밤 보급 에이전트

작업 디렉터리: `~/prj/ktree`. 모든 DB 작업은 `node` 도구로 한다 (인증은 `~/.zshrc` 의
`KTREE_EMAIL`/`KTREE_PASSWORD` 를 자동으로 읽는다).

**새벽 05:30 에 무인으로 돈다** (`eng-pack-nightly.sh` → launchd). 그래서:
- 물어보지 않는다. 막히면 그 단계만 건너뛰고 나머지를 끝낸 뒤 로그에 남긴다.
- 허용된 도구는 `Bash(node *)` · `Bash(npm install*)` · Read/Write/Edit/Glob/Grep/WebSearch/WebFetch 다.
- 마지막에 한국어 한 줄로 요약한다 (로그에 남아 아침에 읽는다).

## 0. 먼저 오늘 것이 있는지 본다

```bash
node eng-gen.mjs --recent 12
```

첫 줄이 `오늘(날짜) 장면 N개 · 기사 M개` 다.
- 장면이 **3개 이상**이고 기사가 1개면 **이미 채워진 것이다.** 2·3단계는 건너뛰고 4번(일기·인박스)만 한다.
- 목록을 보고 **최근에 쓴 상황·기사를 반복하지 않는다.** 같은 상황이 이틀 연속 나오면 훈련이 안 된다.

## 1. 상황 대화 장면 3~5개

하루 목표는 **4개**. 토픽을 네 갈래로 **골고루** 가른다 — `일상 · 여행 · 비즈니스 · 테크`.
(사용자 맥락: 백엔드 개발자(Go/Kafka/k8s), 해외 이직 준비. 비즈니스·테크는 이 맥락으로 쓴다.)

장면 하나 = **7턴 내외, 내 턴 3개**. `drafts/english/scene-<날짜>-<슬러그>.json` 에 쓴다:

```json
{
  "id": "2026-10-01-hotel-noise",
  "situation_ko": "호텔 방이 시끄러워 바꿔달라고 한다. 프런트가 대안을 제시한다.",
  "topic": "여행", "level": 2,
  "voices": { "a": "en-US-AvaMultilingualNeural", "b": "en-US-AndrewMultilingualNeural" },
  "turns": [
    { "who": "a", "role_ko": "프런트", "en": "Front desk, how can I help?" },
    { "who": "b", "role_ko": "나", "is_me": true,
      "intent_ko": "옆방 소음 때문에 못 잤다고 말해봐", "en": "I couldn't sleep — the room next door was really loud." }
  ],
  "vocab": [
    { "term": "I couldn't sleep", "meaning_ko": "잠을 못 잤다",
      "prompt_ko": "소음 때문에 잠을 못 잤다고 말해봐" }
  ]
}
```

규칙:
- **`who`는 두 값만** — `a`(상대역) / `b`(나). `is_me: true` 인 턴이 내가 메울 자리다.
- `intent_ko` 는 **"~해봐" 상황 지시**다. 영어를 번역하라는 게 아니라 의도만 준다 —
  영어가 보이면 읽기가 되고 훈련이 안 된다.
- `en` 은 모범 대사. 내 턴도 오디오를 굽는다 (셰도잉에서 대화 전체가 흘러야 하고,
  역할 채우기에서 답을 들려줘야 한다).
- **레벨 = CEFR 앵커**: L1≈A2(고빈도·단문) · L2≈B1(구동사·연어) · L3≈B2(복문·완곡·설득) · L4≈C1(저빈도 관용구·격식 조절)
- 대화가 **대본대로 흘러가지 않게** 한다. 예상 못 한 변수를 하나 넣는다 (더 싼 선택지를 권한다, 지금은 바쁘다고 미룬다).
- `vocab` 2~5개. **`prompt_ko` 가 없으면 어휘로 안 올라간다** — 상황이 없으면 산출 복습을 만들 수 없다.

생성:

```bash
node eng-gen.mjs drafts/english/scene-<날짜>-<슬러그>.json
```

오디오·단어 타이밍·DB 행·어휘까지 한 번에 처리한다. 출력의 `✓ 정렬` 과 `✓ 어휘 N개 저장` 을 확인한다.
정렬이 97% 미만이면 그 장면은 하이라이트가 밀린다 — 문장을 단순하게 고쳐 다시 굽는다.

## 2. 뉴스 기사 1건

**60~90초 분량(140~200단어).** 소재는 **테크 기본, 주 2회는 일반 시사** — 테크만 하면
어휘가 좁아지고 면접 스몰토크는 시사로 간다.

1. 웹에서 오늘 기사 2~3건을 찾는다 (Hacker News 톱, 주요 엔지니어링 블로그, 일반지 헤드라인).
2. **원문을 베끼지 말고 요약해서 직접 쓴다.** 저작권 문제이고, 읽어주는 건 우리가 다시 쓴 글이다.
   출처는 `sources` 에 링크로 남긴다.
3. 배울 값이 있는 표현 4~6개를 **자연스럽게 심는다.**
4. `drafts/english/article-<날짜>.json`:

```json
{
  "id": "2026-10-01-<슬러그>", "title": "<한 줄 헤드라인>",
  "topic": "테크", "level": 2, "voice": "en-US-AndrewMultilingualNeural",
  "sentences": ["Good morning!", "…"],
  "summary_ko": ["세 줄", "요약", "한국어"],
  "vocab": [{ "term": "…", "meaning_ko": "…", "prompt_ko": "…" }],
  "sources": [{ "title": "…", "url": "…" }]
}
```

- `sentences` 는 **문장 하나 = 박스 하나**다. 한 문장이 너무 길면 박스가 화면을 넘긴다.
- `"Good morning!"` 으로 시작해서 마지막에 한 줄 권유로 닫는다.

```bash
node eng-gen.mjs drafts/english/article-<날짜>.json
```

## 3. 인박스 변환 (있을 때만)

```bash
node upload-eng.mjs inbox-pending
```

비어 있으면 건너뛴다. 있으면 각 항목을 카드로 만들어 `drafts/english/inbox-<날짜>.json` 에
`[{ "id": "...", "card": { "topic","scenario","level","prompt_ko","answer_en","note" } }]` 로 저장하고
`node upload-eng.mjs inbox-convert <파일>`. 표현이 아닌 입력은 `{ "id": "...", "discard": true }`.

## 4. 일기 교정 (있을 때만)

```bash
node upload-eng.mjs journal-pending
```

비어 있으면 건너뛴다. 있으면 문장 단위로 교정해
`[{ "entry_date": "...", "corrected": [{ "orig","better","why","ok" }] }]` 로 저장하고
`node upload-eng.mjs journal-correct <파일>`. 재사용 값이 있는 것 **최대 2개**는 어휘로도 만든다.

## 보고

```
✓ 장면 4개(일상·여행·비즈니스·테크) · 기사 1건 · 어휘 19개 · 인박스 0 · 일기 0 — 오디오 2.5분
```

한 줄 + 특이사항. **실패한 단계는 반드시 적는다** — 무인 실행이라 이 로그가 유일한 단서다.

## 하지 말 것

- 물어보기. 무인 실행이라 답할 사람이 없다.
- `prompt_ko` 없이 어휘를 만드는 것. 뜻만 아는 단어는 며칠 뒤에 못 꺼낸다.
- 기사 원문 복붙.
- 같은 상황을 이틀 연속 만드는 것 (`--recent` 를 먼저 보는 이유다).
- 이미 4개가 차 있는데 또 만드는 것. 큐가 무제한이라 바닥나지 않으므로 과잉 생성은 용량만 먹는다.

## 참고

- 옛 방식(토픽×레벨 카드 팩 `node upload-eng.mjs pack`)도 아직 살아 있다. 어휘를 직접
  보충할 때만 쓴다 — 하루 판의 본체는 장면·기사다.
- 용량: 장면 하나 ≈ 22초/260KB, 기사 ≈ 60초/700KB. 하루 ≈ 1.7MB.
  무료 1GB 한도라 **30일 지난 오디오는 지우고 텍스트·타이밍만 남기는 정리**가 언젠가 필요하다.
