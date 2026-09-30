-- ============================================================
-- 콘텐츠는 공유, 진도는 각자
-- SQL Editor 에 붙여넣고 실행. 두 번 실행해도 안전하다.
--
-- 문제: eng_scenes/eng_articles 가 auth.uid() = user_id 로 묶여 있어서
--   **내가 만든 장면을 같이 쓰는 사람이 못 읽는다.** 밤 보급은 한 머신에서 한 계정으로만
--   도니까, 다른 사람이 로그인하면 장면 0 · 기사 0 인 빈 화면을 본다.
--
-- 고치는 방향: 장면·기사는 **읽기를 열고 쓰기는 만든 사람만**.
--   어휘 SRS·세션·XP 는 반드시 개인별이라 그대로 둔다.
--
-- 어휘가 까다롭다. SRS 상태(다음 복습일·간격·연속)는 사람마다 달라야 해서 행을 공유할 수 없다.
--   → 장면·기사 행에 vocab 을 **실어두고**, 앱이 처음 만났을 때 **자기 계정으로 카드를 만들어낸다.**
--   그러면 RLS 를 깨지 않고도 둘이 같은 어휘를 각자의 진도로 가져간다.
--
-- ⚠️ SELECT 를 USING (true) 로 연다 = 이 프로젝트에 로그인한 사람은 누구나 장면·기사를 읽는다.
--    학습 콘텐츠라 민감하지 않다고 보고 단순하게 갔다. 계정이 늘어 곤란해지면
--    공유 대상 id 목록 테이블을 만들어 USING (auth.uid() = ANY(...)) 로 좁히면 된다.
-- ============================================================

-- ── 어휘를 행에 싣는다 ──────────────────────────────────
-- [{ kind, term, meaning_ko, prompt_ko, example, level }]
ALTER TABLE public.eng_scenes   ADD COLUMN IF NOT EXISTS vocab jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.eng_articles ADD COLUMN IF NOT EXISTS vocab jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 장면·기사: 읽기는 모두, 쓰기는 만든 사람만 ──────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eng_scenes','eng_articles']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_own"    ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_read"   ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', t, t);

    EXECUTE format('CREATE POLICY "%s_read" ON public.%I
                    FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I
                    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I
                    FOR UPDATE TO authenticated
                    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I
                    FOR DELETE TO authenticated USING (auth.uid() = user_id)', t, t);
  END LOOP;
END $$;

-- eng_sessions · eng_progress · eng_cards 는 건드리지 않는다 — 진도는 각자다.

-- ── 확인 ────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('eng_scenes','eng_articles')
ORDER BY tablename, cmd;
