-- ============================================================
-- ktree English 모드 스키마
-- Supabase SQL Editor 에서 이 파일 전체를 한 번 실행하면 된다.
-- 푸시 구독은 챌린지의 push_subscriptions 를 그대로 재사용한다.
-- ============================================================

-- 토픽: 활성/비활성 토글용. 카드의 topic 은 이 name 을 문자열로 가리킨다
CREATE TABLE IF NOT EXISTS public.eng_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 카드: 토픽(소재) × scenario(상황) × level(난이도, CEFR A2~C1 ≈ 1~4)
CREATE TABLE IF NOT EXISTS public.eng_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  scenario text NOT NULL DEFAULT '',
  level integer NOT NULL DEFAULT 2 CHECK (level BETWEEN 1 AND 4),
  prompt_ko text NOT NULL,
  answer_en text NOT NULL,
  note text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'pack'
    CHECK (source IN ('pack', 'session', 'inbox', 'journal', 'briefing')),
  source_ref text,                       -- 원문 링크·세션 날짜 등
  -- SRS 상태
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'learning', 'mature', 'suspended')),
  interval_days integer NOT NULL DEFAULT 0,
  ease numeric NOT NULL DEFAULT 2.5,
  streak integer NOT NULL DEFAULT 0,
  next_review date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 카드 중복 업로드 방지 (팩 재업로드 = upsert)
  UNIQUE (user_id, prompt_ko, answer_en)
);

CREATE INDEX IF NOT EXISTS idx_eng_cards_due
  ON public.eng_cards (user_id, next_review) WHERE status <> 'suspended';
CREATE INDEX IF NOT EXISTS idx_eng_cards_topic
  ON public.eng_cards (user_id, topic, status);

-- 복습 기록: 통계·스트릭·주간 리포트의 원천
CREATE TABLE IF NOT EXISTS public.eng_review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.eng_cards(id) ON DELETE CASCADE,
  grade text NOT NULL CHECK (grade IN ('miss', 'soso', 'good')),
  mode text NOT NULL DEFAULT 'review' CHECK (mode IN ('review', 'speak')),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eng_review_log_user_time
  ON public.eng_review_log (user_id, reviewed_at DESC);

-- 일기: 폰에서 raw 제출 → 밤 에이전트가 corrected 채움
CREATE TABLE IF NOT EXISTS public.eng_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT current_date,
  raw text NOT NULL,
  -- [{ "orig": "...", "better": "...", "why": "...", "ok": false }, ...]
  corrected jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'corrected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

-- 인박스: 주운 표현 한 줄 → 밤 에이전트가 카드로 변환
CREATE TABLE IF NOT EXISTS public.eng_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  source text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'discarded')),
  card_id uuid REFERENCES public.eng_cards(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 브리핑: 밤 에이전트가 생성한 그날의 듣기 스크립트
CREATE TABLE IF NOT EXISTS public.eng_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_date date NOT NULL DEFAULT current_date,
  title text NOT NULL DEFAULT '',
  script text NOT NULL,
  level integer NOT NULL DEFAULT 2,
  expressions jsonb,                     -- ["dropped ZooKeeper for good", ...] 하이라이트용
  sources jsonb,                         -- [{ "title": "...", "url": "..." }]
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brief_date)
);

-- updated_at 트리거 (챌린지 것과 동일한 패턴, 함수는 별도로 둔다)
CREATE OR REPLACE FUNCTION public.eng_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eng_cards_touch ON public.eng_cards;
CREATE TRIGGER eng_cards_touch
BEFORE UPDATE ON public.eng_cards
FOR EACH ROW EXECUTE FUNCTION public.eng_touch_updated_at();

DROP TRIGGER IF EXISTS eng_journal_touch ON public.eng_journal;
CREATE TRIGGER eng_journal_touch
BEFORE UPDATE ON public.eng_journal
FOR EACH ROW EXECUTE FUNCTION public.eng_touch_updated_at();

-- ============================================================
-- RLS: 전부 본인 것만 (개인 학습 데이터)
-- ============================================================
ALTER TABLE public.eng_topics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_cards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_review_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_journal    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_inbox      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_briefings  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eng_topics','eng_cards','eng_review_log','eng_journal','eng_inbox','eng_briefings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_own" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_own" ON public.%I FOR ALL TO authenticated
       USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
  END LOOP;
END $$;
