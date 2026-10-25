-- 어휘 드릴은 mode='vocab' 으로 채점 기록을 남기는데 CHECK 가 review·speak 만 허용했다.
-- 기록 insert 가 거절되면 saveGrade 가 통째로 오프라인 큐로 빠지고, flush 도 매번 실패했다.
alter table public.eng_review_log drop constraint eng_review_log_mode_check,
  add constraint eng_review_log_mode_check check (mode in ('review','speak','vocab'));
