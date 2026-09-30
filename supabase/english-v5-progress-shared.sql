-- ============================================================
-- 진도 공유 — 서로 얼마나 했는지 보이게
-- SQL Editor 에 붙여넣고 실행. 두 번 실행해도 안전하다.
--
-- 콘텐츠(장면·기사)는 v4 에서 공유로 열었다. 이번엔 **진도**다.
-- 같이 쓰는 사람이 오늘 했는지, 연속 며칠인지 서로 보이면 안 하고 넘어가기 어려워진다.
--
-- 여는 것:
--   eng_sessions  오늘 진행(장면·기사·어휘)·xp_earned·completed_at → 오늘 상태와 연속일
--   eng_progress  xp_total·turns_spoken·listened_ms·articles_read → 누적 기록
--
-- ⚠️ 여는 것은 **읽기뿐**이다. 쓰기는 여전히 본인만 — 남의 진도를 고칠 수는 없다.
--
-- 열지 않는 것 (의도적):
--   eng_cards    SRS 상태는 개인별이고, 어휘 장부가 두 사람 카드를 섞어 보이게 된다
--   eng_journal  **일기다.** 교정받는 개인 글이라 절대 열지 않는다
--   eng_inbox    주워 담은 표현 메모
--
-- 🔴 앱 쪽 준비가 먼저다. "내 것" 질의가 RLS 에 기대고 있으면, 읽기를 여는 순간
--    maybeSingle() 이 두 사람 행을 만나 터지거나 남의 진도를 내 것으로 표시한다.
--    english.html 의 7개 질의에 .eq('user_id', …) 를 박아두었다 (커밋 참조).
--    그 코드가 배포된 뒤에 이 SQL 을 실행할 것.
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eng_sessions','eng_progress']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_own"    ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_read"   ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', t, t);

    -- 읽기는 로그인한 사람 모두 (진도는 서로 보라고 여는 것이다)
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I
                    FOR SELECT TO authenticated USING (true)', t, t);
    -- 쓰기는 본인만
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I
                    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I
                    FOR UPDATE TO authenticated
                    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I
                    FOR DELETE TO authenticated USING (auth.uid() = user_id)', t, t);
  END LOOP;
END $$;

-- eng_cards · eng_journal · eng_inbox 는 건드리지 않는다 — 위 주석 참조.

-- ── 확인 ────────────────────────────────────────────────
-- eng_sessions 4줄 + eng_progress 4줄 = 8줄 이어야 한다.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('eng_sessions','eng_progress')
ORDER BY tablename, cmd;
