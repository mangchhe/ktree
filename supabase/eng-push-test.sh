#!/bin/sh
# 크론을 기다리지 않고 지금 한 번 쏴본다. 폰에 알림이 오면 배선이 끝난 것이다.
# (due 카드가 0이면 'no due cards' 가 돌아오고 알림은 안 온다 — 정상)
curl -sS -X POST 'https://mfzlrmwjwwpykjbsafud.supabase.co/functions/v1/eng-push-daily' \
  -H 'Authorization: Bearer sb_publishable_L9tV1otxzn8yoC7fvwD6fw_qqiN5iyp' \
  -H 'Content-Type: application/json' \
  -d '{}' ; echo
