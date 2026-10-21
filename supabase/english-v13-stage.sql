-- 커리큘럼 단계 (S1 문장 만들기 → S2 과거로 말하기 → S3 이어 말하기 → S4 실전).
-- 왜 DB 인가: 단계가 문항 유형·답 길이·판 구성을 정한다. 기기마다 다르면 폰에선 S2,
-- 노트북에선 S1 이 되어 같은 날 다른 판이 뜬다.
-- stage_since: 승급 실적은 "이 단계에 올라온 뒤" 것만 센다.
alter table public.eng_progress add column if not exists stage smallint not null default 1;
alter table public.eng_progress add column if not exists stage_since date;
alter table public.eng_progress drop constraint if exists eng_progress_stage_chk;
alter table public.eng_progress add constraint eng_progress_stage_chk check (stage between 1 and 4);
