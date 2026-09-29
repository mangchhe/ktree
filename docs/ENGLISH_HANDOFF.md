# English 모드 — 인계 노트 (2026-09-29 기준)

> 회사에서 만들다 집에서 이어가기 위한 상태 스냅샷. 전체 사용법·셋업은 [ENGLISH_SETUP.ko.md](./ENGLISH_SETUP.ko.md).

## 완료된 것 (전부 검증됨)

| 항목 | 상태 |
|---|---|
| Supabase 스키마 (`supabase/english-schema.sql`) | ✅ **실행 완료** — eng_topics/cards/review_log/journal/inbox/briefings + RLS |
| 오디오 스키마 (`supabase/english-audio.sql`) | ✅ **실행 완료** — audio_url 컬럼 + eng-audio 버킷 |
| `english.html` (6화면 PWA) | ✅ 로컬(`npx serve .` → /english) 동작 확인. 로그인·큐·채점·일기·인박스 스모크 테스트 통과 |
| 시드 카드 52장 | ✅ 업로드됨 (일상·여행·비즈니스·테크 × L1~L4) |
| 카드 네이티브 오디오 52장 | ✅ Storage `eng-audio/cards/<id>.mp3` 생성 완료 (Andrew 뉴럴) |
| 오늘의 브리핑 (웰컴) | ✅ 텍스트+오디오 업로드됨 |
| `/eng`, `/eng-pack` 스킬 | ✅ **레포 안** `.claude/skills/` — clone 하면 어느 머신에서든 바로 동작 |
| sw.js | ✅ /english 캐시 + 알림 클릭 일반화 (캐시명 ktree-v2) |

## 남은 작업 (집에서)

1. **배포** — english.html + sw.js 를 기존 호스팅에 올리기 (빌드 없음). 폰에서 /english → 홈 화면에 추가 → 로그인 → 🔔 푸시 켜기.
2. **아침 푸시 배선** (코드는 완성, 배포만):
   - `supabase/functions/eng-push-daily/index.ts` 를 Dashboard → Edge Functions 에 생성·붙여넣기 (VAPID_PRIVATE_KEY 시크릿은 push-notify 와 공유라 추가 설정 없음). 또는 `npx supabase login` 후 `npx supabase functions deploy eng-push-daily`.
   - cron 등록: SETUP 문서 4번의 SQL (매일 UTC 22:30 = KST 07:30).
3. **밤 보급 자동화** — `/eng-pack` 1회 수동 실행으로 검증 후, `/schedule 매일 05:30 /eng-pack` 등록.
5. `.env` 는 gitignore — 집 머신에 `KTREE_EMAIL` / `KTREE_PASSWORD` 를 `ktree/.env` 로 다시 만들어야 CLI 도구가 돈다.

## 도구 요약

```bash
node upload-eng.mjs stats                          # 토픽×레벨 재고
node upload-eng.mjs pack <cards.json>              # 카드팩 업로드
node upload-eng.mjs briefing <b.json> [b.mp3]      # 브리핑(+오디오)
node upload-eng.mjs journal-pending|journal-correct|inbox-pending|inbox-convert
node tts-cards.mjs                                 # 오디오 없는 카드만 mp3 생성
node tts-brief.mjs <brief.json> <out.mp3> [voice]  # 브리핑 mp3
```

## 아키텍처 한 줄

토픽(소재)×scenario(상황)×level(CEFR 난이도) 카드 + SM-2 유사 SRS + 무제한 큐(due→신규→앞당겨).
소리는 2계층: Storage 의 미리 구운 뉴럴 mp3(`cards/<id>.mp3`, msedge-tts 무료) → 없으면 기기 TTS 폴백.
콘텐츠 공급은 밤의 /eng-pack (재고 보급 + 일기 교정 + 인박스 변환 + 뉴스 브리핑 생성).
