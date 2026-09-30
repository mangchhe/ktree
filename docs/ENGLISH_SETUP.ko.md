# English 모드 셋업 가이드

지하철 SRS 복습 + 책상 회화 세션 + 밤 자동 보급으로 도는 영어 학습 시스템입니다.

```
[책상]  /eng 회화 세션 ──┐
[폰]    일기·인박스 제출 ─┼─→ Supabase ─→ /english (PWA)
[밤]    /eng-pack 보급  ──┘              Review · Listen(브리핑) · Speak · Journal · Inbox
```

## 1) 테이블 생성 (1회)

Supabase Dashboard → SQL Editor 에서 [`supabase/english-schema.sql`](../supabase/english-schema.sql) 전체를 붙여넣고 실행.
(eng_topics / eng_cards / eng_review_log / eng_journal / eng_inbox / eng_briefings + RLS. 푸시 구독은 챌린지의 `push_subscriptions` 재사용이라 추가 작업 없음)

## 2) 시드 카드 업로드 (1회)

```bash
cd ~/prj/ktree
node upload-eng.mjs pack drafts/english/seed-pack-2026-09.json   # 52장: 일상·여행·비즈니스·테크 × L1~L4
node upload-eng.mjs stats                                        # 재고 확인
```

인증은 기존과 동일하게 `KTREE_EMAIL` / `KTREE_PASSWORD` (환경변수 또는 `ktree/.env`).

## 3) 배포 + 폰 설치

- `english.html` 을 기존 호스팅에 그대로 배포 (빌드 없음). `/english` 로 접속.
- **iOS**: Safari 로 열고 공유 → **홈 화면에 추가**. 푸시는 홈 화면 설치 상태에서만 옵니다 (iOS 16.4+).
- 앱에서 로그인(ktree 계정) → 홈 하단 **🔔 아침 푸시 켜기**.

## 3.5) 브리핑 네이티브 음성 (선택, 권장)

1. SQL Editor 에서 [`supabase/english-audio.sql`](../supabase/english-audio.sql) 실행 (audio_url 컬럼 + eng-audio 버킷).
2. 밤 보급(/eng-pack)이 MS Edge 뉴럴 TTS(무료, `msedge-tts` npm)로 mp3 를 구워 올린다:
   ```bash
   node tts-brief.mjs drafts/english/brief-<날짜>.json brief.mp3   # 스크립트 → mp3
   node upload-eng.mjs briefing drafts/english/brief-<날짜>.json brief.mp3
   ```
3. 앱은 오디오가 있으면 그걸 재생(🎙 네이티브 음성 표시), 없으면 기기 TTS 폴백.
4. **문장 카드도 네이티브 음성으로**: `node tts-cards.mjs` — 오디오 없는 카드만 골라
   `eng-audio/cards/<카드id>.mp3` 로 일괄 생성. 앱은 이 경로를 먼저 시도하고 없으면 기기 TTS 폴백
   (스키마 변경 불필요). 새 팩 업로드 후 한 번씩 돌리면 되고, /eng-pack 이 알아서 한다.
   음성 교체는 `node tts-cards.mjs --all --voice en-US-AvaMultilingualNeural`.

**폴백 음성 팁 (iPhone)**: 카드/브리핑은 기본적으로 미리 구운 네이티브 mp3 를 재생하고,
파일이 아직 없는 새 카드만 기기 TTS 로 폴백합니다. 폴백 품질을 올리고 싶으면
설정 → 손쉬운 사용 → 콘텐츠 말하기 → 음성 → 영어에서 **향상됨/프리미엄** 음성을 받아두세요
(앱이 자동으로 우선 선택).

## 4) 아침 푸시 (선택)

1. 엣지 펑션 배포: Dashboard → Edge Functions → `eng-push-daily` 생성 후
   [`supabase/functions/eng-push-daily/index.ts`](../supabase/functions/eng-push-daily/index.ts) 붙여넣기.
   (`VAPID_PRIVATE_KEY` 시크릿은 push-notify 와 공유 — 이미 설정돼 있음)
2. SQL Editor 에서 크론 등록 — [`supabase/eng-push-cron.sql`](../supabase/eng-push-cron.sql) 을
   **그대로 붙여넣어 실행**하면 된다 (anon key 이미 채워져 있고, 두 번 실행해도 중복 등록 안 됨).
   배선 확인은 `./supabase/eng-push-test.sh` — 크론을 안 기다리고 지금 한 번 쏜다.

   <details><summary>SQL 원문 (직접 쓰고 싶을 때)</summary>

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'eng-push-daily', '30 22 * * *',
  $$ select net.http_post(
       url := 'https://mfzlrmwjwwpykjbsafud.supabase.co/functions/v1/eng-push-daily',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || '<SUPABASE_ANON_KEY>'
       ),
       body := '{}'::jsonb) $$);
```

   </details>

## 5) 데일리 루프

| 언제 | 뭘 | 어디서 |
|---|---|---|
| 아침 | 푸시 탭 → Review 큐 (다 돌면 신규→앞당겨 복습, 바닥 없음) + 브리핑 듣기 | 폰 |
| 틈틈이 | 주운 표현 → Inbox / Listen 셰도잉 | 폰 |
| 저녁 | `/eng standup` 등 회화 세션 (교정이 카드로 자동 업로드) | Claude Code |
| 자기 전 | Journal 에 오늘 하루 3~5문장 (받아쓰기로) | 폰 |
| 밤 | `/eng-pack` — 재고 보급 + 일기 교정 + 인박스 변환 + 브리핑 생성 | Claude Code (수동 또는 스케줄) |

### 밤 보급 자동화 — 로컬 launchd

**클라우드 routine(`/schedule`)으로는 안 된다.** 클라우드 에이전트는 로컬 환경변수를 못 읽어서
`KTREE_EMAIL`/`KTREE_PASSWORD` 가 없고(`upload-eng.mjs` 가 비밀번호 로그인을 쓴다),
GitHub 연결도 따로 필요하다. routine 설정에 비밀번호를 적는 선택은 하지 않는다.

그래서 이 머신의 launchd 로 돈다:

```
eng-pack-nightly.sh                                      래퍼 — PATH·자격증명·로그를 챙긴다
~/Library/LaunchAgents/com.hajoo.ktree.engpack.plist     매일 05:30 (로컬 = KST)
~/Library/Logs/ktree-engpack.log                         실행 로그 (append, 2MB 회전)
```

- 준비 상태만 보기: `./eng-pack-nightly.sh --check` — 아무것도 안 바꾸고 재고만 찍는다
- 지금 한 번 돌리기: `launchctl kickstart -p gui/$(id -u)/com.hajoo.ktree.engpack`
- 등록 / 해제:
  `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hajoo.ktree.engpack.plist`
  / `launchctl bootout gui/$(id -u)/com.hajoo.ktree.engpack`
- 권한은 `--allowedTools` 로 필요한 것만 연다. **전체 우회는 쓰지 않는다** — 감독 없이 도는 세션이다.
  로그에 권한 거부가 보이면 그 명령을 래퍼의 목록에 추가한다.
- 맥이 자고 있었으면 launchd 가 **깨어난 직후 실행**한다 (cron 과 달리 건너뛰지 않는다).
- 다른 머신에서는 plist 의 경로와 `Label` 만 바꿔 같은 래퍼를 쓰면 된다.

## 배포 버전 확인

빌드 단계가 없는 정적 페이지라 버전을 손으로 관리한다. **두 군데가 같아야 한다** —
`english.html` 의 `BUILD` 와 `sw.js` 의 `CACHE`. 어긋나면 폰이 옛 오프라인 캐시를 계속 물고 있는데
아무도 모른다. 그래서 스크립트가 둘을 같이 고친다:

```bash
./bump-version.sh --show    # 지금 버전과 동기 여부
./bump-version.sh           # 오늘 날짜로 올린다 (같은 날 재배포면 .2, .3 …)
```

배포 순서: `./bump-version.sh` → 커밋 → push → 폰에서 확인.

**앱에서 보는 곳**: 로그인 화면 아래, 그리고 홈 맨 아래에 `build 2026-09-30.2` 가 찍힌다.
서비스워커 캐시 이름도 같이 대조해서, PWA 가 구버전을 물고 있으면
`캐시 ktree-… — 앱을 완전히 닫고 다시 열어주세요` 로 **그 자리에서 드러난다.**

**바깥에서 확인**: 라이브 파일과 로컬이 같은지 해시로 본다.

```bash
diff <(curl -sS https://mangchhe.github.io/ktree/english) english.html && echo 같음
```

## 도구 치트시트

```bash
node upload-eng.mjs pack <cards.json>     # 카드팩 업로드 (중복은 갱신, SRS 상태 보존)
node upload-eng.mjs stats                 # 토픽×레벨 재고 (unseen/total)
node upload-eng.mjs journal-pending       # 교정 대기 일기 JSON
node upload-eng.mjs journal-correct <f>   # 교정 반영
node upload-eng.mjs inbox-pending         # 변환 대기 인박스 JSON
node upload-eng.mjs inbox-convert <f>     # 인박스 → 카드
node upload-eng.mjs briefing <f>          # 오늘의 브리핑 업로드
```

## 설계 메모

- **좌표계**: 토픽(소재: 일상/여행/비즈니스/테크/…) × scenario(상황) × level(난이도, CEFR A2→C1 ≈ L1→L4). 레벨은 잠금이 아니라 라벨.
- **SRS**: SM-2 유사. good → interval×ease(2.5±), soso → ×1.2, miss → 내일. interval 21일↑ = mature.
- **무제한 큐**: due → 신규 → 앞당겨 복습 순으로 이어져 바닥나지 않는다. 보급은 재고(unseen<15) 기반.
- **오프라인**: 마지막 큐를 localStorage 에 캐시, 지하철에서 복습한 결과는 복귀 시 자동 sync.
- **토픽 추가** = 앱에서 ＋ 탭 (행 추가일 뿐, 다음 보급부터 자동으로 채워짐).
