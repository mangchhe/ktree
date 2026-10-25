-- 스피킹 녹음 교정. 앱이 녹음을 올리고 pending 행을 만든다 → Mac 의 speak-fix.mjs 가 1분마다
-- 받아쓰기(whisper) + 교정(claude -p)을 해서 done 으로 채운다. 앱은 그 행을 보여준다.
-- 녹음은 본인만 읽는 비공개 버킷에 둔다 (eng-audio 는 공개라 쓰면 안 된다).
create table if not exists public.eng_speak_fix (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prompt_id  uuid not null references public.eng_prompts(id) on delete cascade,
  stage      smallint not null default 1,
  audio_path text not null,
  spoke_ms   int,
  status     text not null default 'pending' check (status in ('pending','working','done','error')),
  transcript text,
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists eng_speak_fix_user on public.eng_speak_fix (user_id, created_at desc);
alter table public.eng_speak_fix enable row level security;
drop policy if exists eng_speak_fix_own on public.eng_speak_fix;
create policy eng_speak_fix_own on public.eng_speak_fix for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('eng-speak', 'eng-speak', false)
on conflict (id) do nothing;
-- 경로 첫 칸이 자기 user_id 인 것만
drop policy if exists eng_speak_own on storage.objects;
create policy eng_speak_own on storage.objects for all to authenticated
  using (bucket_id = 'eng-speak' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'eng-speak' and (storage.foldername(name))[1] = auth.uid()::text);
