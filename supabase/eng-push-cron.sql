-- 아침 푸시 크론 등록 — Supabase SQL Editor 에 그대로 붙여넣어 실행한다.
-- 매일 KST 07:30 (= UTC 22:30) 에 eng-push-daily 를 깨운다.
--
-- 전제: Edge Functions 에 `eng-push-daily` 가 먼저 배포돼 있어야 한다
--       (supabase/functions/eng-push-daily/index.ts 붙여넣기).
--       VAPID_PRIVATE_KEY 시크릿은 push-notify 와 공유라 추가 설정이 없다.
--
-- 아래 anon key 는 index.html 에 이미 들어 있는 공개 클라이언트 키다 (RLS 로 보호).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 두 번 실행해도 중복 등록되지 않게 먼저 지운다
select cron.unschedule('eng-push-daily')
where exists (select 1 from cron.job where jobname = 'eng-push-daily');

select cron.schedule(
  'eng-push-daily',
  '30 22 * * *',                    -- UTC 22:30 = KST 07:30
  $$
  select net.http_post(
    url := 'https://mfzlrmwjwwpykjbsafud.supabase.co/functions/v1/eng-push-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_L9tV1otxzn8yoC7fvwD6fw_qqiN5iyp'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- 확인
select jobname, schedule, active from cron.job where jobname = 'eng-push-daily';
