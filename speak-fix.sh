#!/bin/zsh
# 스피킹 교정 일꾼 래퍼. launchd(com.hajoo.ktree.speakfix)가 1분마다 부른다.
# launchd 는 로그인 셸을 안 거치므로 PATH·자격증명을 여기서 채운다 (eng-pack-nightly.sh 와 같은 이유).
# 자격증명은 첫 로그인(또는 세션이 죽었을 때)에만 쓰이고, 평소엔 ~/.config/ktree 의 세션을 쓴다.
emulate -L zsh
REPO="${0:A:h}"
LOG="$HOME/Library/Logs/ktree-speakfix.log"
[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc" >/dev/null 2>&1
precmd_functions=(); preexec_functions=()
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
if [[ -f "$LOG" && $(stat -f%z "$LOG") -gt 1048576 ]]; then
  tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
cd "$REPO" || exit 1
# 할 일이 없으면 아무것도 안 찍는다 — 1분마다 도니 로그가 빈 줄로 차면 못 읽는다
out=$(node speak-fix.mjs 2>&1)
[[ -n "$out" ]] && print -r -- "[$(date '+%m-%d %H:%M:%S')] $out" >> "$LOG"
exit 0
