-- 오픽 공략(종합). eng_tips 의 영상별 팁을 전부 모아 이 학습자 수준·단계에 맞춰 하나로 엮은 것.
-- Mac 일꾼이 팁 영상이 늘 때마다 다시 만든다(src_n = 엮을 때 쓴 영상 수).
create table if not exists public.eng_guide (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  guide      jsonb not null,   -- { summary, sections:[{ title, why, items:[{ head, body, stage, kinds, ex, refs:[{v,t}] }] }] }
  src_n      int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.eng_guide enable row level security;
drop policy if exists eng_guide_own on public.eng_guide;
create policy eng_guide_own on public.eng_guide for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
select count(*) from public.eng_guide;
