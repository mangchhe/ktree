-- v11 이 kind='line' · source='flag' 를 쓰기 시작했는데 CHECK 는 안 풀었다.
-- 그래서 카드가 아직 없는 걸 찍으면(대화 한 줄, 처음 보는 어휘) 전부 거절됐다.
alter table public.eng_cards drop constraint eng_cards_kind_check,
  add constraint eng_cards_kind_check check (kind in ('word','phrase','pattern','line'));
alter table public.eng_cards drop constraint eng_cards_source_check,
  add constraint eng_cards_source_check check (source in
    ('pack','session','inbox','journal','briefing','scene','article','flag'));
