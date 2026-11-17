-- 「한국어로 먼저 말하기」 — 하고 싶은 말을 한국어로 녹음하면 speak-fix.mjs 가
-- 지금 단계 수준의 쉬운 영어 문장으로 바꿔준다. 같은 테이블·버킷, lang 만 다르다.
alter table public.eng_speak_fix
  add column if not exists lang text not null default 'en' check (lang in ('en','ko'));
select 'ok';
