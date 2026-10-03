-- ============================================================
-- 장면 통짜 오디오 — 백그라운드 재생용
--
-- iOS 는 홈 화면 PWA 에서 백그라운드 오디오를 막는다(플랫폼 제약, 코드로 못 뚫는다).
-- 다만 WebKit 버그의 실제 증상은 **"한 트랙은 끝나는데 다음이 시작되지 않는다"** 이고,
-- 우리 장면은 턴마다 파일을 쪼개 이어 붙이므로 정확히 그 함정에 걸린다.
-- 기사는 이미 단일 파일이라 사정이 낫다.
--
-- 그래서 장면도 **한 덩어리 파일을 하나 더** 둔다. 쪼갠 파일은 그대로 남긴다 —
-- 역할 채우기는 내 턴에서 멈춰야 하므로 턴별 파일이 계속 필요하다.
--   full_url    이어붙인 mp3
--   full_starts 각 턴이 그 파일에서 시작하는 ms. 하이라이트를 유지하려면 필요하다.
-- ============================================================

ALTER TABLE public.eng_scenes ADD COLUMN IF NOT EXISTS full_url text;
ALTER TABLE public.eng_scenes ADD COLUMN IF NOT EXISTS full_starts jsonb NOT NULL DEFAULT '[]'::jsonb;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'eng_scenes' AND column_name IN ('full_url','full_starts')
ORDER BY column_name;
