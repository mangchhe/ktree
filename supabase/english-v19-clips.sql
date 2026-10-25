-- 섀도잉 영상 — 유튜브 링크와 지금 따라 하는 구간(at_sec 부터 chunk_sec 만큼).
-- 영상은 퍼오지 않는다. 앱이 유튜브 공식 임베드로 튼다.
create table if not exists public.eng_clips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  video_id   text not null,
  title      text,
  at_sec     int  not null default 0,
  chunk_sec  int  not null default 600,
  created_at timestamptz not null default now()
);
alter table public.eng_clips enable row level security;
drop policy if exists eng_clips_own on public.eng_clips;
create policy eng_clips_own on public.eng_clips for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
select count(*) from public.eng_clips;
