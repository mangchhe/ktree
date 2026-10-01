-- ============================================================
-- 독백(Speaking) — 오픽 대비
-- SQL Editor 에 붙여넣고 실행. 두 번 실행해도 안전하다.
--
-- 왜 새 축인가: 지금 앱은 **한 문장짜리 대화 턴**을 훈련한다 (내 턴 중앙값 9단어).
-- 실생활 회화엔 맞지만 오픽은 **혼자 60~90초를 말하는 시험**이고, ACTFL 등급을 가르는
-- 것은 text type 이다 — 문장 단위면 IM, 문단 단위로 조직하면 IH, 문단을 엮으면 AL.
-- 9단어 턴을 아무리 잘해도 천장에 걸린다.
--
-- 장면·기사·어휘는 그대로 둔다. 장면은 롤플레이 대비, 기사는 듣기·어휘 공급,
-- 어휘 SRS 는 그대로 쓸모 있다. 독백이 축 하나로 **더 붙는** 것이다.
-- ============================================================

-- ── 프롬프트 풀 — 콘텐츠라 공유한다 (장면·기사와 같은 취급) ──
CREATE TABLE IF NOT EXISTS public.eng_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 오픽 문항 유형. 등급을 올리려면 유형을 고루 돌아야 한다.
  kind text NOT NULL CHECK (kind IN ('describe','habit','past','compare','ask','solve')),
  topic text NOT NULL,                      -- eng_topics.name 과 같은 값 (한국어 그대로)
  level integer NOT NULL DEFAULT 2,         -- 1~4, 기존 레벨 체계와 같다
  question_en text NOT NULL,                -- 실제로 들리는 문항
  hint_ko text NOT NULL DEFAULT '',         -- 무엇을 말해야 하는지 (영어를 번역해주는 게 아니다)
  seconds integer NOT NULL DEFAULT 75,      -- 목표 분량
  model_en text NOT NULL DEFAULT '',        -- 모범답안 — **문단 구조가 보이게** 쓴다
  model_note_ko text NOT NULL DEFAULT '',   -- 왜 이렇게 구성했는지
  phrases jsonb NOT NULL DEFAULT '[]'::jsonb,  -- 담화 표지 등 [{term, meaning_ko}]
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eng_prompts_kind  ON public.eng_prompts (kind);
CREATE INDEX IF NOT EXISTS idx_eng_prompts_topic ON public.eng_prompts (topic);

-- ── 푼 기록 — 개인별이다 (남의 진도와 섞이면 안 된다) ──
CREATE TABLE IF NOT EXISTS public.eng_prompt_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES public.eng_prompts(id) ON DELETE CASCADE,
  done_on date NOT NULL DEFAULT current_date,
  spoke_ms integer NOT NULL DEFAULT 0,      -- 실제로 말한 시간
  self_grade text CHECK (self_grade IN ('again','ok','good')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, prompt_id, done_on)
);
CREATE INDEX IF NOT EXISTS idx_eng_prompt_log_user ON public.eng_prompt_log (user_id, done_on DESC);

ALTER TABLE public.eng_prompts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eng_prompt_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- 프롬프트: 읽기는 모두, 쓰기는 만든 사람만 (v4 의 장면·기사와 같은 규칙)
  EXECUTE 'DROP POLICY IF EXISTS "eng_prompts_read"   ON public.eng_prompts';
  EXECUTE 'DROP POLICY IF EXISTS "eng_prompts_insert" ON public.eng_prompts';
  EXECUTE 'DROP POLICY IF EXISTS "eng_prompts_update" ON public.eng_prompts';
  EXECUTE 'DROP POLICY IF EXISTS "eng_prompts_delete" ON public.eng_prompts';
  EXECUTE 'CREATE POLICY "eng_prompts_read"   ON public.eng_prompts FOR SELECT TO authenticated USING (true)';
  EXECUTE 'CREATE POLICY "eng_prompts_insert" ON public.eng_prompts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY "eng_prompts_update" ON public.eng_prompts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY "eng_prompts_delete" ON public.eng_prompts FOR DELETE TO authenticated USING (auth.uid() = user_id)';

  -- 기록: 본인만 (읽기도 막는다 — 남이 뭘 몇 번 다시 했는지까지 볼 일은 아니다)
  EXECUTE 'DROP POLICY IF EXISTS "eng_prompt_log_own" ON public.eng_prompt_log';
  EXECUTE 'CREATE POLICY "eng_prompt_log_own" ON public.eng_prompt_log FOR ALL TO authenticated
           USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
END $$;

-- ── 확인 ────────────────────────────────────────────────
-- eng_prompts 4줄 + eng_prompt_log 1줄 = 5줄 이어야 한다.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('eng_prompts','eng_prompt_log')
ORDER BY tablename, cmd;
