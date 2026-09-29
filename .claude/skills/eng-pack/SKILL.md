---
name: eng-pack
description: ktree English 밤 보급. 카드 재고 확인 후 얇은 토픽×레벨에 새 팩 생성, 일기 교정, 인박스 표현 카드 변환, 오늘의 브리핑 생성까지 한 번에 처리한다. 사용자가 /eng-pack 이라고 하거나 "영어 카드 보급", "팩 생성", "일기 교정해줘"라고 할 때, 또는 스케줄(밤 크론)로 실행.
---

# /eng-pack — 밤 보급 에이전트

작업 디렉터리: `~/prj/me/ktree`. 모든 DB 작업은 `node upload-eng.mjs <cmd>` 로 한다 (인증은 .env 의 KTREE_EMAIL/PASSWORD 자동).
아래 4단계를 순서대로 전부 수행하고, 마지막에 처리 요약을 한국어로 보고한다. 인자로 특정 단계만 지정되면 (예: `/eng-pack briefing`) 그것만.

## 1. 재고 확인 → 팩 생성

1. `node upload-eng.mjs stats` — 활성(●) 토픽 중 **unseen(안 본 카드)이 레벨당 15장 미만**인 곳이 보급 대상.
2. 보급 대상마다 카드 15~30장을 생성해 `drafts/english/pack-<날짜>-<토픽>.json` 에 저장 후 `node upload-eng.mjs pack <파일>`.
3. **카드 오디오 생성**: 모든 업로드가 끝난 뒤 `node tts-cards.mjs` 한 번 — 오디오 없는 카드만 네이티브 mp3 로 구워 Storage 에 올린다 (일기·인박스 변환 카드 포함되도록 마지막에).

카드 생성 기준:
- **level = CEFR 앵커**: L1≈A2(고빈도 어휘, 단문, 직역해도 통함) · L2≈B1(구동사·연어, 직역으로 안 나오는 자연스러운 표현) · L3≈B2(복문, hedging·완곡·설득) · L4≈C1(저빈도 관용구, 격식 조절, 60~90초 담화)
- prompt_ko 는 "~라고 말해봐 / ~를 부탁해봐" 형식의 **상황 지시** (번역 문제가 아님)
- note 에는 왜 이 표현인지 / 흔한 한국식 오류가 뭔지 한 줄
- scenario 는 소문자 영문 한 단어 (standup, meeting, hotel, smalltalk, design, interview …)
- 사용자 맥락: 백엔드 개발자(Go/Kafka/k8s), 해외 이직 준비. 테크·비즈니스 카드는 이 맥락으로.
- 최근 복습 기록에서 miss 가 많은 패턴이 보이면 그쪽을 보강 (stats 만으로 모르면 생략 가능)

## 2. 일기 교정

1. `node upload-eng.mjs journal-pending` → pending 일기 JSON.
2. 각 일기의 raw 를 문장 단위로 나눠 교정한다:
   - 자연스러운 문장 → `{ "orig": "...", "ok": true }`
   - 어색한 문장 → `{ "orig": "...", "better": "...", "why": "<한국어 한 줄>", "ok": false }`
   - 받아쓰기 오타로 보이면 의도를 추정해 교정하고 why 에 언급
3. `drafts/english/journal-<날짜>.json` 에 `[ { "entry_date": "...", "corrected": [...] } ]` 로 저장 → `node upload-eng.mjs journal-correct <파일>`.
4. 교정 중 **재사용 가치가 있는 것 최대 2개**는 카드로도 만든다 (source: "journal", 1번 팩 파일에 포함하거나 별도 pack 업로드).

## 3. 인박스 변환

1. `node upload-eng.mjs inbox-pending` → 대기 항목.
2. 각 항목을 카드로: 표현의 뜻·용법에 맞는 상황 prompt_ko 를 만들어 `[ { "id": "...", "card": {...} } ]` 형식으로 `drafts/english/inbox-<날짜>.json` 저장 → `node upload-eng.mjs inbox-convert <파일>`.
3. 표현이 아닌 쓰레기 입력은 `{ "id": "...", "discard": true }`.

## 4. 오늘의 브리핑

1. 웹에서 오늘의 테크 뉴스 2~3건을 찾는다 (Hacker News 톱, 주요 엔지니어링 블로그 등).
2. **60~90초 분량(140~200단어)** 영어 스크립트를 쓴다:
   - 사용자 레벨(L2~L3, B1+)에 맞춘 어휘. "Good morning! Here's your daily tech briefing." 으로 시작
   - 배울 가치가 있는 표현 3~5개를 자연스럽게 심는다
   - 원문을 베끼지 말고 요약해서 직접 쓴다 (출처는 sources 로)
3. `drafts/english/brief-<날짜>.json`:

```json
{ "brief_date": "<YYYY-MM-DD>", "title": "<한 줄 헤드라인>", "script": "...", "level": 2,
  "expressions": ["<스크립트에 등장하는 표현 그대로>", "..."],
  "sources": [ { "title": "...", "url": "..." } ] }
```

4. **네이티브 오디오 생성** (뉴럴 TTS, 무료):
   `node tts-brief.mjs drafts/english/brief-<날짜>.json drafts/english/brief-<날짜>.mp3`
   (기본 음성 en-US-AndrewMultilingualNeural. 실패해도 중단하지 말 것 — 오디오 없이 올리면 앱이 기기 TTS 로 폴백)
5. 업로드: `node upload-eng.mjs briefing drafts/english/brief-<날짜>.json drafts/english/brief-<날짜>.mp3`
   expressions 는 스크립트 본문과 **철자까지 동일**해야 앱에서 하이라이트된다.
6. expressions 중 2~3개는 카드로도 만든다 (source: "briefing", source_ref 에 출처 URL).

## 보고

`✓ 팩 N장(토픽별) · 일기 N건 교정 · 인박스 N건 변환 · 브리핑 1건 — 내일 아침 큐 M장` 형식 한 줄 + 특이사항.

## 스케줄 등록 (사용자가 요청할 때)

`/schedule` 로 매일 새벽(예: 05:30 KST) `/eng-pack` 실행을 등록하면 완전 자동 보급이 된다.
