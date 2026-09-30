-- ============================================================
-- ktree English 개편 (하루 한 판) — 추가 스키마
-- Supabase SQL Editor 에서 이 파일 전체를 한 번 실행하면 된다.
-- 기존 english-schema.sql 을 **대체하지 않고 덧붙인다** — eng_cards(어휘)·
-- eng_review_log(SRS 기록)·eng_topics 는 그대로 쓴다.
--
--  eng_scenes    상황 대화 장면. 턴마다 오디오 URL 과 단어 타이밍(segs/ev)
--  eng_articles  뉴스 기사. 문장별 segs 와 문장 시작 시각
--  eng_sessions  하루 판 — 무엇이 걸렸고 어디까지 했는지 (순서는 강제하지 않는다)
--  eng_progress  경험치·랭크·누적 학습량
-- ============================================================

-- ── 장면 ────────────────────────────────────────────────
-- turns 는 jsonb 배열. 한 턴 = { who, role_ko, en, intent_ko, is_me,
--   audio_url, ms, segs:[[텍스트, 이벤트번호|null]…], ev:[{t,d}…], voice }
-- 왜 jsonb 인가: 턴은 장면 밖에서 따로 조회되지 않고 항상 장면 단위로 읽힌다.
-- 테이블로 쪼개면 조인만 늘고 얻는 게 없다.
CREATE TABLE IF NOT EXISTS public.eng_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id text NOT NULL,                -- 생성기가 붙이는 사람이 읽는 id (날짜-슬러그)
  situation_ko text NOT NULL,
  topic text NOT NULL DEFAULT '일상',
  level integer NOT NULL DEFAULT 2 CHECK (level BETWEEN 1 AND 4),
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  ms integer NOT NULL DEFAULT 0,         -- 오디오 총 길이. 학습량 통계의 원천
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scene_id)
);

-- ── 기사 ────────────────────────────────────────────────
-- sentences = 문장 배열(박스 하나 = 문장 하나)
-- segs      = 문장별 [[텍스트, 이벤트번호|null]…]  — 하이라이트가 이걸 그대로 쓴다
-- ev        = 이벤트 [{t,d}…] (전체 오디오 기준 ms)
-- starts    = 문장별 시작 시각 — 박스 탭 재생이 이걸 쓴다
CREATE TABLE IF NOT EXISTS public.eng_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id text NOT NULL,
  title text NOT NULL,
  topic text NOT NULL DEFAULT '테크',
  level integer NOT NULL DEFAULT 2 CHECK (level BETWEEN 1 AND 4),
  sentences jsonb NOT NULL DEFAULT '[]'::jsonb,
  segs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ev jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_ko jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  audio_url text,
  voice text NOT NULL DEFAULT '',
  ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_id)
);

-- ── 하루 판 ─────────────────────────────────────────────
-- **순서를 강제하지 않는다.** 그래서 "무엇을 했나"를 판이 직접 들고 있어야 한다 —
-- 순서가 있으면 위치로 알 수 있지만, 자유롭게 하면 각 칸의 진행을 따로 적어야 한다.
-- progress 예: { "scenes": {"done": 3, "total": 5},
--                "article": {"sent": 6, "total": 14},
--                "vocab":  {"today": 12, "past": 6, "done": 0} }
CREATE TABLE IF NOT EXISTS public.eng_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT current_date,
  scene_ids uuid[] NOT NULL DEFAULT '{}',
  article_id uuid REFERENCES public.eng_articles(id) ON DELETE SET NULL,
  vocab_ids uuid[] NOT NULL DEFAULT '{}',   -- 오늘 나온 어휘 (eng_cards)
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  xp_earned integer NOT NULL DEFAULT 0,
  completed_at timestamptz,                 -- 세 칸을 다 채운 시각. 완주 보너스 판정용
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_eng_sessions_date
  ON public.eng_sessions (user_id, session_date DESC);

-- ── 경험치·랭크·누적 ────────────────────────────────────
-- 사용자당 한 행. 통계의 **원천은 eng_review_log** 이고 여기는 누적 캐시다 —
-- 따로 세는 값(들은 시간, 말한 턴)만 여기에 쌓는다.
-- xp_today/xp_date 는 하루 상한(약 250) 판정용. 날짜가 바뀌면 리셋한다.
CREATE TABLE IF NOT EXISTS public.eng_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_total integer NOT NULL DEFAULT 0,
  xp_today integer NOT NULL DEFAULT 0,
  xp_date date NOT NULL DEFAULT current_date,
  listened_ms bigint NOT NULL DEFAULT 0,    -- 실제 재생한 오디오 길이 누적
  turns_spoken integer NOT NULL DEFAULT 0,  -- 대화 턴 + 어휘 산출
  articles_read integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 어휘의 출처에 scene/article 을 허용 ─────────────────
-- 개편 후 어휘는 장면·기사에서 나온다. 기존 CHECK 에 없으면 삽입이 거부된다.
-- 어휘 자체는 eng_cards 를 그대로 쓴다 — prompt_ko(상황) · answer_en(표현) · note(설명)
-- 구조가 어휘의 산출 복습과 정확히 맞고, SRS 필드도 이미 있다.
ALTER TABLE public.eng_cards DROP CONSTRAINT IF EXISTS eng_cards_source_check;
ALTER TABLE public.eng_cards ADD CONSTRAINT eng_cards_source_check
  CHECK (source IN ('pack','session','inbox','journal','briefing','scene','article'));

-- ── RLS — 기존 파일과 같은 방식 ─────────────────────────
ALTER TABLE public.eng_scenes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_articles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_progress  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eng_scenes','eng_articles','eng_sessions','eng_progress']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_own" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_own" ON public.%I FOR ALL TO authenticated
       USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
  END LOOP;
END $$;

-- ── 확인 ────────────────────────────────────────────────
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS cols
FROM (VALUES ('eng_scenes'),('eng_articles'),('eng_sessions'),('eng_progress')) AS t(table_name)
WHERE EXISTS (SELECT 1 FROM information_schema.tables it
              WHERE it.table_name = t.table_name AND it.table_schema = 'public');
