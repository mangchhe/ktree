#!/bin/zsh
# 배포 버전을 올린다. english.html 의 BUILD 와 sw.js 의 CACHE 를 **같은 값으로** 맞춘다.
#
# 왜 스크립트인가: 이 앱은 빌드 단계가 없는 정적 페이지다. 두 파일을 손으로 고치면
# 반드시 어긋나고, 어긋나면 폰이 옛 오프라인 캐시를 계속 물고 있는데 아무도 모른다.
#
#   ./bump-version.sh          오늘 날짜로 올린다 (같은 날 두 번이면 .2, .3 …)
#   ./bump-version.sh --show   지금 버전만 보여준다

emulate -L zsh
setopt err_exit pipefail
cd "${0:A:h}"

cur=$(sed -nE "s/^const BUILD = '([^']+)';/\1/p" english.html | head -1)
swc=$(sed -nE "s/^const CACHE = 'ktree-([^']+)';/\1/p" sw.js | head -1)

if [[ "$1" == "--show" ]]; then
  print -r -- "english.html BUILD : ${cur:-(없음)}"
  print -r -- "sw.js        CACHE : ktree-${swc:-(없음)}"
  [[ "$cur" == "$swc" ]] && print -r -- "✓ 동기 상태" || print -r -- "✗ 어긋남 — ./bump-version.sh 로 맞추세요"
  exit 0
fi

[[ -n "$cur" ]] || { print -u2 -r -- "✗ english.html 에서 BUILD 를 못 찾음"; exit 1 }

today=$(date '+%Y-%m-%d')
if [[ "$cur" == "$today."* ]]; then
  serial=$(( ${cur##*.} + 1 ))          # 같은 날 재배포 → 일련번호 증가
else
  serial=1
fi
new="$today.$serial"

# 두 파일을 한 값에서 같이 쓴다 (따로 고칠 여지를 안 남긴다)
perl -pi -e "s/^const BUILD = '\Q$cur\E';/const BUILD = '$new';/" english.html
perl -pi -e "s/^const CACHE = 'ktree-[^']+';/const CACHE = 'ktree-$new';/" sw.js

a=$(sed -nE "s/^const BUILD = '([^']+)';/\1/p" english.html | head -1)
b=$(sed -nE "s/^const CACHE = 'ktree-([^']+)';/\1/p" sw.js | head -1)
[[ "$a" == "$new" && "$b" == "$new" ]] || { print -u2 -r -- "✗ 갱신 확인 실패 (html=$a sw=$b)"; exit 1 }

print -r -- "✓ $cur → $new  (english.html · sw.js 동기)"
print -r -- "  커밋하고 push 하면 폰에서 build $new 로 보입니다."
