-- ============================================================
-- 어휘를 층으로 가른다 — 단어 / 표현 / 패턴
-- SQL Editor 에 붙여넣고 실행. 두 번 실행해도 안전하다.
--
-- 왜 가르나: 목적이 다르면 복습 방식도 달라야 한다.
--   word    목적은 **뜻 알기(인지)**   → 영어를 보고 뜻을 떠올린다
--   phrase  목적은 **뱉기(산출)**      → 상황을 보고 영어를 말한다
--   pattern 목적은 **갈아끼우기**       → 구조를 다른 상황에 적용한다 (아직 미사용)
-- 한 층으로 섞으면 단어에 "이 상황을 영어로"를 요구하게 되고,
-- 표현에 "뜻 확인"만 시키면 훈련이 안 된다.
--
-- 컬럼은 더 만들지 않는다. 기존 세 칸이 층마다 역할만 바뀐다:
--   word   : answer_en=단어      prompt_ko=뜻        note=예문·용법
--   phrase : answer_en=표현      prompt_ko=상황      note=설명
-- ============================================================

ALTER TABLE public.eng_cards
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'phrase';

ALTER TABLE public.eng_cards DROP CONSTRAINT IF EXISTS eng_cards_kind_check;
ALTER TABLE public.eng_cards ADD CONSTRAINT eng_cards_kind_check
  CHECK (kind IN ('word', 'phrase', 'pattern'));

-- 층별 조회가 잦다 (오늘 나온 것 · 돌아온 것을 층으로 갈라 뽑는다)
CREATE INDEX IF NOT EXISTS idx_eng_cards_kind
  ON public.eng_cards (user_id, kind, next_review) WHERE status <> 'suspended';

-- 확인 — 기존 카드는 전부 phrase 로 남는다
SELECT kind, count(*) AS n
FROM public.eng_cards
GROUP BY kind
ORDER BY kind;
