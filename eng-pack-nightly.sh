#!/bin/zsh
# 밤 보급을 무인으로 돌린다. launchd 가 이걸 부른다 (docs/ENGLISH_SETUP.ko.md 참조).
#
# 왜 래퍼가 필요한가: launchd 는 로그인 셸을 안 거치므로 PATH 도 ~/.zshrc 의
# KTREE_EMAIL/KTREE_PASSWORD 도 없다. 여기서 직접 채워 claude 에 물려준다.
#
#   ./eng-pack-nightly.sh --check   준비 상태만 확인하고 끝낸다 (아무것도 안 바꿈)
#   ./eng-pack-nightly.sh           /eng-pack 을 무인으로 실행

emulate -L zsh
setopt pipefail

REPO="${0:A:h}"
LOG="$HOME/Library/Logs/ktree-engpack.log"
CLAUDE="$HOME/.local/bin/claude"

# ── 자격증명을 먼저, 로그 리다이렉트보다 **앞에서** 끌어온다 ──────────────
# .zshrc 의 프롬프트·타이틀 훅(preexec/precmd)은 명령마다 터미널 이스케이프를
# stdout 에 뿌린다. 로그로 리다이렉트한 뒤에 소스하면 그게 전부 로그에 박힌다.
[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc" >/dev/null 2>&1
precmd_functions=(); preexec_functions=()
unfunction precmd preexec 2>/dev/null
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

# ── 이제부터 로그 ─────────────────────────────────────────────────────
# 2MB 넘으면 뒤쪽 500줄만 남긴다 (무인 실행이라 아무도 안 치운다)
if [[ -f "$LOG" && $(stat -f%z "$LOG") -gt 2097152 ]]; then
  tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exec >> "$LOG" 2>&1
say() { print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

say "─── eng-pack 시작 (repo=$REPO) ───"

fail=0
[[ -x "$CLAUDE" ]]              || { say "✗ claude 가 없다: $CLAUDE"; fail=1 }
command -v node >/dev/null      || { say "✗ node 를 PATH 에서 못 찾음"; fail=1 }
[[ -f "$REPO/upload-eng.mjs" ]] || { say "✗ upload-eng.mjs 가 없다 — REPO 경로 확인"; fail=1 }
[[ -n "$KTREE_EMAIL" && -n "$KTREE_PASSWORD" ]] \
  || { say "✗ KTREE_EMAIL/KTREE_PASSWORD 가 비었다 (~/.zshrc 확인)"; fail=1 }
[[ -d "$REPO/node_modules/msedge-tts" ]] \
  || say "⚠ msedge-tts 없음 — 오디오는 건너뛴다. 'npm install' 필요"

if (( fail )); then say "─── 준비 실패로 중단 ───"; exit 1; fi
say "✓ 준비 확인: claude·node·repo·자격증명"

cd "$REPO" || { say "✗ cd 실패"; exit 1 }

if [[ "$1" == "--check" ]]; then
  node upload-eng.mjs stats 2>&1 | sed 's/^/    /'
  say "─── --check 종료 (아무것도 바꾸지 않음) ───"
  exit 0
fi

# 권한 프롬프트에 답할 사람이 없으므로 필요한 것만 미리 허용한다.
# 전체 우회(--dangerously-skip-permissions)는 쓰지 않는다 — 새벽에 감독 없이 도는 세션이다.
"$CLAUDE" -p "/eng-pack" \
  --permission-mode dontAsk \
  --allowedTools "Bash(node *)" "Bash(npm install*)" "Bash(git status*)" \
                 Read Write Edit Glob Grep WebSearch WebFetch \
  2>&1 | sed 's/^/    /'
rc=$?

say "─── eng-pack 종료 (exit=$rc) ───"
exit $rc
