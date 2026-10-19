-- eng-audio 에 삭제 정책이 없어서 옛 파일을 치울 수 없었다 (remove() 가 **에러 없이 0장**을
-- 돌려준다 — 정책이 없으면 지울 행이 안 보이는 것이라 성공처럼 보인다).
-- 경로 규칙을 바꾸면 옛 파일이 남는 일이 또 생기므로 상시 정책으로 둔다.
-- 위험도는 이미 있는 UPDATE 정책과 같다 — upsert 로 덮어쓸 수 있는 파일이면 지울 수도 있다.
create policy eng_audio_delete on storage.objects
  for delete to authenticated using (bucket_id = 'eng-audio');
