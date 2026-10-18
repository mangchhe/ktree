-- 찍어놓기 — 못 외운 어휘를 따로 모아 복습하고 따로 듣는다.
-- status 와 섞지 않는다: status 는 SRS 단계(new/learning/mature/suspended)이고
-- 이건 **사람이 손으로 찍는 표시**다. 둘을 한 컬럼에 넣으면 찍는 순간 복습 단계가 날아간다.
alter table public.eng_cards
  add column if not exists flagged boolean not null default false;

-- 찍은 것만 보는 질의가 잦다 (어휘 탭 Flagged 칩 · 따로 듣기)
create index if not exists eng_cards_flagged_idx
  on public.eng_cards (user_id, flagged) where flagged;
