#!/usr/bin/env node
/** 알아듣기 문법(READ) 검사.
 *  왜: 대사 아래 칩이 **틀린 문법 이름**을 붙이면, 기본 문법을 모르는 사람은 그걸 그대로 믿는다.
 *  예문이 자기 패턴에 안 걸리거나, "going to the store"(가다)에 미래 칩이 붙으면 오히려 해롭다.
 *
 *   node check-read.mjs                 규칙 검사
 *   node check-read.mjs turns.tsv       + 실제 대사(level<TAB>en)에서 얼마나 붙는지 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, `추출 실패: ${a}`); return html.slice(i, j); };
const { READ, readHits } = new Function(`${cut('const READ = [', '/* READ 끝')}
  ${cut('function readHits', '/* 문법 한 항목')}
  return { READ, readHits };`)();
const keys = en => readHits(en, 99).map(h => READ[h.i].key);

// 1) 항목마다 해석법·예문이 있고, 예문은 자기 패턴에 걸린다
assert.strictEqual(new Set(READ.map(g => g.key)).size, READ.length, 'key 가 겹친다');
for (const g of READ) {
  assert.ok(g.name && g.ko && g.read?.length > 20, `${g.key}: 설명이 비었다`);
  assert.ok(g.ex.length >= 2, `${g.key}: 예문이 2개 미만`);
  for (const [en, ko] of g.ex) {
    assert.ok(ko, `${g.key}: "${en}" 뜻이 없다`);
    assert.ok(keys(en).includes(g.key), `${g.key}: 예문 "${en}" 이 자기 패턴에 안 걸린다 — 칩과 설명이 어긋난다`);
  }
}

// 2) 흔한 오탐 — 걸리면 틀린 걸 가르친다
const not = (en, key, why) => assert.ok(!keys(en).includes(key), `"${en}" 에 ${key} 가 붙었다 — ${why}`);
not("I'm going to the store.", 'goingto', 'going to + 장소는 "가다" 다');
not("It's nothing.", 'ing', 'nothing 은 진행형이 아니다');
not('The meeting is at three.', 'ing', 'meeting 은 명사다');
not('I have to go now.', 'perfect', 'have to 는 현재완료가 아니다');
not('I have a car.', 'perfect', '그냥 have 다');
not('The light was red.', 'passive', 'red 는 p.p. 가 아니다');
not('Would you like some tea?', 'would', '부탁·I\'d like 쪽이다');
not("I'd like a coffee.", 'would', "I'd like 는 따로 있다");
not("You'd better hurry.", 'would', "'d better 는 had better 다");
not("I'll have it delivered tomorrow.", 'perfect', 'have + 목적어 + p.p. 는 사역(시키다)이다');
not("I've got a meeting at three.", 'perfect', "I've got 은 \"있다\" 다 — \"~해 봤다\" 로 가르치면 틀린다");
not("I'm moving in May.", 'maybe', 'May 는 달이다');
not('The deadline is May 3.', 'maybe', 'May 3 은 날짜다');
assert.ok(keys('Have you checked the logs?').includes('perfect'), '문장 첫머리 Have you + p.p. 를 놓쳤다');
assert.ok(keys('It may take a while.').includes('maybe'), 'may 를 놓쳤다');

// 3) 실제 장면 대사 — 손으로 확인한 정답
const real = [
  ['Could you take a look at my PR when you get a chance?', ['request']],
  ['Then we\'ll cancel this card and send you a new one.', ['will']],
  ["Not urgent, but I'd like to get it merged by tomorrow if possible.", ['like', 'if']],
  ["Then let's not do it all at once.", ['lets']],
  ['I was paying at the supermarket just now, and my card got declined.', ['ing', 'passive']],
  ["That wasn't me. I haven't been abroad, and the card is in my wallet.", ['perfect']],
  ['Thanks for calling. How can I help you today?', ['preping']],
  ["We've been working late for three months straight.", ['perfect']],
];
for (const [en, want] of real)
  assert.deepStrictEqual(readHits(en).map(h => READ[h.i].key), want, `"${en.slice(0, 50)}…"`);

// 4) 한 줄에 칩은 두 개까지
assert.ok(readHits("If you could check, I'd like to know if it'll be done. Let's see.").length <= 2, '칩이 두 개를 넘는다');

// 5) (선택) 실제 대사에서 얼마나 붙나 — 거의 안 붙으면 쓸모없고, 거의 다 붙으면 소음이다
if (process.argv[2]) {
  const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => l.split('\t').slice(1).join('\t'));
  const hit = rows.filter(en => readHits(en).length);
  const per = {};
  for (const en of rows) for (const h of readHits(en)) per[READ[h.i].key] = (per[READ[h.i].key] || 0) + 1;
  const pct = Math.round(hit.length / rows.length * 100);
  console.log(`  대사 ${rows.length}줄 중 ${hit.length}줄(${pct}%)에 칩 — ` +
    Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
  assert.ok(pct >= 30 && pct <= 85, `칩이 ${pct}% 줄에 붙는다 — 너무 적거나 너무 많다`);
  for (const g of READ) assert.ok(per[g.key], `${g.key}: 실제 대사에 한 번도 안 붙는다 — 패턴이 죽었다`);
}

console.log(`✓ 알아듣기 문법 ${READ.length}개 — 예문 자기 일치 · 오탐 13종 차단 · 실제 대사 ${real.length}줄 정답`);
