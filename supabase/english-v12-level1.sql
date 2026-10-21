-- NH(Novice High) 에서 출발하는 사람을 위한 짧은 답변.
-- 왜: 기존 model_en 은 평균 650자, 9문장, IM~IH 어휘다. NH 는 문장을 "이어서"
-- 만들지 못하는 단계라 그걸 따라 말하게 하면 입이 안 떨어진다 (실측: 3초·10초).
-- 같은 질문에 대해 짧고 쉬운 답(3~4문장, 현재시제, 종속절 없음)을 따로 둔다.
alter table public.eng_prompts add column if not exists model_l1 text;
