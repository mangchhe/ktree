-- 오픽 팁 영상. 사용자가 고른 유튜버 강의를 Mac 일꾼(speak-fix.mjs)이 한국어 자막째 받아(transcript)
-- 팁으로 정리한다(tips). 앱 Plan 탭 「오픽 팁」과 Speaking 문항 아래 「💡 팁」이 이걸 쓴다. 본인만 본다.
create table if not exists public.eng_tips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  video_id   text not null,
  title      text,
  channel    text,
  sort       int  not null default 0,
  transcript jsonb,   -- [{ t, text }]
  tips       jsonb,   -- [{ t, head, body, ex:[en], kinds:[...] }]
  err        text,
  created_at timestamptz not null default now(),
  unique (user_id, video_id)
);
alter table public.eng_tips enable row level security;
drop policy if exists eng_tips_own on public.eng_tips;
create policy eng_tips_own on public.eng_tips for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 영상 목록은 계정에 따로 넣는다 (이메일을 리포에 두지 않는다)
select count(*) from public.eng_tips;
