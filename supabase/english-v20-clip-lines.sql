-- 섀도잉 영상 문장 목록. 유튜브 임베드는 폰에서 자막을 안 띄웠다 →
-- Mac 일꾼(speak-fix.mjs)이 yt-dlp 로 영어 자막을 받아 문장으로 묶고 뜻을 붙여 넣는다.
-- lines: [{ t: 초, en, ko }]   lines_err: 못 가져온 이유 (자막 없는 영상 등)
alter table public.eng_clips add column if not exists lines jsonb;
alter table public.eng_clips add column if not exists lines_err text;
select count(*) from public.eng_clips where lines is null;
