-- 스피킹 질문의 한국어 뜻. 소리로 먼저 듣고(시험과 같게), 못 알아들었을 때 펼쳐 본다.
-- 기존 91문항은 drafts/english/question-ko-backfill.tsv 로 채웠다.
alter table public.eng_prompts add column if not exists question_ko text;
