#!/usr/bin/env node
/** Speaking 네 걸음 검사.
 *  왜: (1) 설명이 없는 유형이 섞이면 그 문항에서만 초보가 다시 맨입이 된다.
 *      (2) 30초 문턱이 빠지면 3초 말하고 Done 을 누르던 상태로 바로 돌아간다 — 실측 기록이다.
 *      (3) 문장 쪼개는 규칙은 앱과 tts-cards 가 **같아야** 한다. 어긋나면 따라 말하기가 전부 로봇 음성이 된다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('const KIND_LABEL ='), html.indexOf('function qBtns('));
const { KIND_LABEL, KIND_GUIDE, FRAME, sentences, STEP_LABEL, MIN_SPEAK, stepRow } =
  new Function(`const esc = s => String(s); ${src}
    spStep = 2;
    return { KIND_LABEL, KIND_GUIDE, FRAME, sentences, STEP_LABEL, MIN_SPEAK, stepRow };`)();

// 1) 유형마다 설명과 틀이 둘 다 있어야 한다
for (const k of Object.keys(KIND_LABEL)) {
  const g = KIND_GUIDE[k];
  assert.ok(g, `${k}: 설명이 없다 — 이 유형이 나오면 "뭘 말하지" 로 돌아간다`);
  for (const f of ['asks', 'exam', 'when', 'earns', 'trap'])
    assert.ok(g[f]?.trim().length > 10, `${k}.${f}: 비었거나 너무 짧다`);
  assert.ok(FRAME[k]?.length >= 3, `${k}: 틀이 없다`);
}

// 2) 30초 문턱
assert.ok(MIN_SPEAK >= 30, `문턱이 ${MIN_SPEAK}초 — 30초 밑으로 내리면 의미가 없다`);
const solo = html.slice(html.indexOf('function drawSpSolo('), html.indexOf('/* ── 막 2'));
assert.ok(/id="sp-end" disabled/.test(solo), 'Done 이 처음부터 눌리면 0초로 끝낼 수 있다');
assert.ok(/endEl\.disabled = sec < MIN_SPEAK/.test(solo), '타이머가 Done 문턱을 안 건다');
assert.ok(/MIN_SPEAK - sec/.test(solo), '남은 초를 안 보여주면 왜 안 눌리는지 모른다');

// 3) 걸음 줄
const row = stepRow();
assert.strictEqual(STEP_LABEL.length, 4, '걸음은 넷이다');
assert.strictEqual((row.match(/data-nav=/g) || []).length, 4, '걸음 수만큼 나와야 한다');
assert.ok(/class="tchip on" data-nav="2"/.test(row), '지금 걸음에 on 이 와야 한다');

// 4) 문장 쪼개기 — 앱과 tts-cards 가 같은 규칙을 쓴다
assert.deepStrictEqual(sentences("I go. It's cheap! Why not?\n\nSo, great."),
  ['I go.', "It's cheap!", 'Why not?', 'So, great.']);
assert.deepStrictEqual(sentences(''), [], '빈 모범답안에서 빈 줄이 나오면 안 된다');
assert.deepStrictEqual(sentences(null), []);
const tts = readFileSync(new URL('./tts-cards.mjs', import.meta.url), 'utf8');
assert.ok(tts.includes("appHtml.indexOf('const sentences = t =>')"), 'tts-cards 가 규칙을 베껴 두면 어긋난다');
assert.ok(tts.includes('sentences(x.model_en)'), '모범답안 문장을 굽지 않으면 따라 말하기가 로봇 음성이다');

console.log(`✓ Speaking — ${Object.keys(KIND_GUIDE).length}유형 설명·틀, 문턱 ${MIN_SPEAK}초, 걸음 ${STEP_LABEL.length}`);
