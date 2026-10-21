-- 끝낸 장면·기사. 보관함의 "✓ 해봄" 이 이걸 본다.
-- 왜: 전엔 "그날 판에 올라왔던 것"(eng_sessions.scene_ids)을 해봄으로 썼다. 판에 올라왔는데
-- 안 연 것도 해봄으로 떴고, 보관함에서 다시 보기로 끝낸 건 판 진도에 안 들어가니(일부러) 기록이
-- 아예 없었다. "끝냈다" 는 판 진도와 별개의 사실이라 따로 둔다.
create table if not exists public.eng_done (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item    text not null check (item in ('scene','article')),
  item_id uuid not null,
  done_on date not null,
  primary key (user_id, item, item_id)
);
alter table public.eng_done enable row level security;
drop policy if exists eng_done_own on public.eng_done;
create policy eng_done_own on public.eng_done for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 백필: 판 진도로 알 수 있는 만큼. 장면은 판 순서대로 done 개까지, 기사는 끝까지 간 날만.
insert into public.eng_done (user_id, item, item_id, done_on)
select s.user_id, 'scene', u.sid, s.session_date
from public.eng_sessions s
cross join lateral unnest(s.scene_ids) with ordinality as u(sid, ord)
where u.ord <= least(coalesce((s.progress->'scenes'->>'done')::int, 0), coalesce(array_length(s.scene_ids, 1), 0))
on conflict do nothing;

insert into public.eng_done (user_id, item, item_id, done_on)
select s.user_id, 'article', s.article_id, s.session_date
from public.eng_sessions s
where s.article_id is not null
  and coalesce((s.progress->'article'->>'sent')::int, 0) > 0
  and coalesce((s.progress->'article'->>'sent')::int, 0) >= coalesce((s.progress->'article'->>'total')::int, 1)
on conflict do nothing;
