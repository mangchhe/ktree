-- 스피킹 교정의 고친 표현을 복습 카드로 만든다 (speak-fix.mjs) — source='speak'
-- 왜: 교정은 보고 끝나서 다시 쓰는 데로 안 이어졌다. 막힌 표현을 다시 꺼내는 게 제일 값나간다.
alter table public.eng_cards drop constraint eng_cards_source_check,
  add constraint eng_cards_source_check check (source in
    ('pack','session','inbox','journal','briefing','scene','article','flag','speak'));
select 'ok';
