-- 브리핑 네이티브 오디오용 — SQL Editor 에서 1회 실행
-- (english-schema.sql 이후 추가분)

ALTER TABLE public.eng_briefings ADD COLUMN IF NOT EXISTS audio_url text;

-- 오디오 버킷 (공개 읽기 — URL 은 추측 불가능한 경로)
INSERT INTO storage.buckets (id, name, public)
VALUES ('eng-audio', 'eng-audio', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "eng_audio_read"   ON storage.objects;
DROP POLICY IF EXISTS "eng_audio_insert" ON storage.objects;
DROP POLICY IF EXISTS "eng_audio_update" ON storage.objects;

CREATE POLICY "eng_audio_read" ON storage.objects
FOR SELECT USING (bucket_id = 'eng-audio');

CREATE POLICY "eng_audio_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'eng-audio');

CREATE POLICY "eng_audio_update" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'eng-audio');
