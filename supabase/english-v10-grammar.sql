-- 장면에 **패턴 하나**. 목록이 아니라 하나다 — 나열하면 안 읽는 부록이 된다.
--   { "name_ko": "~하는 게 더 ...하다", "why_ko": "둘 중 하나를 고를 때 비교급으로 묶는다",
--     "turn": 2, "en": "rolling back is riskier than rolling forward" }
-- turn 은 turns 배열의 인덱스 — 그 줄을 짚어 보여준다.
alter table public.eng_scenes
  add column if not exists grammar jsonb;
