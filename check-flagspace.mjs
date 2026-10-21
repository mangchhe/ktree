#!/usr/bin/env node
/** 찍기 버튼이 글자를 가리지 않는지 — 떠 있는(absolute) 버튼마다 그 자리를 비워뒀나.
 *  왜: .prow2 가 오른쪽을 안 비워서 긴 문장(따라 말하기)의 첫 줄이 별 아래로 들어갔다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const css = readFileSync(new URL('./english.html', import.meta.url), 'utf8').replace(/\n\s+/g, ' ');
const rx = s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'g');
const rulesFor = sel => [...css.matchAll(rx(sel))].map(m => m[1]);
// 같은 선택자를 여러 번 쓴다(.dturn .line 이 357·364 두 곳). **전부** 훑어 가장 큰 값을 본다.
const padRight = sel => Math.max(0, ...rulesFor(sel).map(r => +(r.match(/padding-right: ?(\d+)px/)?.[1] || 0)));

// 떠 있는 버튼 → 그 자리를 비워야 하는 글자
for (const [btn, text] of [['.pflag', '.prow2 .pt'], ['.tflag', null]]) {
  const rule = rulesFor(btn)[0];
  assert.ok(rule, `${btn} 규칙이 없다`);
  if (!/position: ?absolute/.test(rule)) continue;         // 흐름 안에 있으면 가릴 일이 없다
  const need = +(rule.match(/right: ?(\d+)px/)?.[1] || 0) + 26;   // 버튼 폭만큼은 비워야 한다
  const got = padRight(text);
  assert.ok(got >= need,
    `${btn} 은 떠 있는데 ${text} 가 ${got}px 만 비웠다 (${need}px 필요) — 글자가 버튼 아래로 들어간다`);
}

// 대화 줄도 같은 규칙 — 여기가 먼저 맞게 돼 있어서 어휘 줄의 누락이 드러났다
assert.ok(padRight('.dturn .line') >= 30, '.dturn .line 이 오른쪽을 안 비웠다');

console.log('✓ 찍기 버튼 — 떠 있는 자리를 글자가 비워둔다');
