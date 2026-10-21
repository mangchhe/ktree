#!/usr/bin/env node
/** 답변 틀 검사 — 질문 유형마다 틀이 있어야 한다.
 *  왜: 틀이 없는 유형이 섞이면 그 날 그 문항에서만 초보가 다시 맨입이 된다.
 *  틀은 접은 채 나와야 한다 — 시험처럼 해보려는 사람의 답을 미리 보여주면 안 된다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('const KIND_LABEL ='), html.indexOf('let spIdx = 0'));
const { KIND_LABEL, FRAME, FRAME_L1, frameHtml } =
  new Function(`const esc = s => String(s); ${src}; return { KIND_LABEL, FRAME, FRAME_L1, frameHtml };`)();

for (const [name, F] of [['FRAME', FRAME], ['FRAME_L1', FRAME_L1]])
for (const k of Object.keys(KIND_LABEL)) {
  const beats = F[k];
  assert.ok(beats?.length >= 3, `${k}: 틀이 없거나 너무 짧다 — 이 유형이 나오면 다시 맨입이다`);
  for (const b of beats) {
    assert.strictEqual(b.length, 2, `${k}: [한국어 지시, 영어 틀] 두 칸이어야 한다`);
    assert.ok(b[0].trim() && b[1].trim(), `${k}: 빈 칸이 있다`);
  }
  // 마무리 줄은 그대로 외워 말하는 게 맞아서 빈칸이 없다 — 전부가 아니라 **대부분**에 ~ 가 있어야 한다
  assert.ok(beats.filter(b => b[1].includes('~')).length >= beats.length - 1,
    `${k}: 채울 자리(~)가 없는 줄이 둘 이상 — 틀이 아니라 외울 문장이 됐다`);
}
assert.deepStrictEqual(Object.keys(FRAME).sort(), Object.keys(KIND_LABEL).sort(),
  'KIND_LABEL 과 FRAME 의 유형이 어긋난다');

const h = frameHtml({ kind:'describe', hint_ko:'힌트', phrases:[{ term:'t', meaning_ko:'ㄸ' }] });
assert.ok(h.startsWith('<details') && !h.includes('<details open'), '틀은 접힌 채 나와야 한다');
assert.strictEqual((h.match(/class="fb"/g) || []).length, FRAME.describe.length, '박자 수가 안 맞다');
assert.ok(h.includes('힌트') && h.includes('t'), '힌트와 표현이 틀 안으로 들어가야 한다');
assert.strictEqual(frameHtml({ kind:'nope' }), '', '줄 게 없으면 빈칸을 그리지 않는다');

// S1·S2 틀은 쉬운 문장이어야 한다 — IM 표현이 섞이면 NH 가 입에 못 올린다
const hard = /I'd say|What happened was|The thing is|ended up|Looking back|Personally/i;
for (const [k, beats] of Object.entries(FRAME_L1))
  for (const [, en] of beats) assert.ok(!hard.test(en), `FRAME_L1.${k}: "${en}" — S3 틀의 표현이 들어왔다`);
const l1 = frameHtml({ kind:'describe', phrases:[{ term:"it's nothing fancy", meaning_ko:'x' }] }, true, true);
assert.ok(l1.includes(FRAME_L1.describe[0][1]), 'l1 이면 S1·S2 틀을 그려야 한다');
assert.ok(!l1.includes('nothing fancy'), 'l1 이면 IH 핵심표현은 숨겨야 한다');
assert.ok(l1.includes('<details class="gram frame" open'), '틀 걸음에서는 펼친 채로');

console.log(`✓ 답변 틀 — ${Object.keys(FRAME).length}유형 전부, 접힌 채로`);
