#!/bin/zsh
# 원격 Supabase 에 SQL 파일을 실행한다.
#
# 왜 이게 필요한가: anon key 로는 DDL 을 못 돌리고, `supabase db push` 는
# migrations/ 구조와 이력 테이블을 전제한다. 우리는 그동안 대시보드에서 손으로
# 적용해와서 이력이 비어 있어, push 하면 과거 것까지 전부 재실행하려 든다
# (english-schema.sql 은 IF NOT EXISTS 가 없어 터진다).
# 그래서 Management API 의 query 엔드포인트를 쓴다 — 이력과 무관하게 한 파일만 돌린다.
#
# 토큰: SUPABASE_ACCESS_TOKEN 이 있으면 그걸, 없으면 Supabase CLI 가 키체인에
# 저장해 둔 것을 쓴다. 어느 쪽이든 값을 출력하지 않는다.
#
#   ./run-sql.sh supabase/english-v6-speaking.sql
#   ./run-sql.sh --query "select count(*) from public.eng_prompts"

emulate -L zsh
setopt pipe_fail
cd "${0:A:h}"

REF=$(sed -nE "s#.*supabase\.co.*#&#p" index.html | sed -nE "s#.*https://([a-z0-9]+)\.supabase\.co.*#\1#p" | head -1)
[[ -n "$REF" ]] || { print -u2 "✗ index.html 에서 프로젝트 ref 를 못 찾음"; exit 1; }

TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -w -s 'Supabase CLI' 2>/dev/null)}"
[[ -n "$TOKEN" ]] || { print -u2 "✗ 토큰 없음 — SUPABASE_ACCESS_TOKEN 을 설정하거나 'supabase login' 하세요"; exit 1; }

if [[ "$1" == "--query" ]]; then SQL="$2"; LABEL="(inline)"
else
  [[ -f "$1" ]] || { print -u2 "✗ 파일이 없습니다: $1"; exit 1; }
  SQL=$(<"$1"); LABEL="$1"
fi

print -r -- "▶ $LABEL → $REF"
BODY=$(jq -Rs '{query: .}' <<< "$SQL") || { print -u2 "✗ jq 가 필요합니다"; exit 1; }
RESP=$(curl -s -w $'\n%{http_code}' -X POST \
  "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$BODY")
CODE=${RESP##*$'\n'}
OUT=${RESP%$'\n'*}

if [[ "$CODE" == 2* ]]; then
  print -r -- "✓ HTTP $CODE"
  print -r -- "$OUT" | jq -r 'if type=="array" and length>0 then (.[0]|keys_unsorted|join("\t")), (.[]|[.[]|tostring]|join("\t")) else "(결과 행 없음)" end' 2>/dev/null || print -r -- "$OUT"
else
  print -u2 -- "✗ HTTP $CODE"
  print -u2 -- "$OUT" | head -c 600
  exit 1
fi
