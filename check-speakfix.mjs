// speak-fix.mjs 의 교정 출력 해석·프롬프트. node check-speakfix.mjs
import assert from 'node:assert/strict';
import { vttLines, parseKo, parseTips, parseGuide, parseFix, buildPrompt } from './speak-fix.mjs';

const j = parseFix('여기 있어:\n```json\n{"intent_ko":"a","fixed":"I live in Seoul.","fixes":[{"said":"I living","better":"I live","why_ko":"x"},{"said":"x"}]}\n```');
assert.equal(j.fixed, 'I live in Seoul.');
assert.equal(j.fixes.length, 1, 'better 없는 항목은 버린다');
assert.throws(() => parseFix('죄송해요'), /JSON 없음/);
assert.throws(() => parseFix('{"fixes":[]}'), /fixed 없음/);
assert.deepEqual(parseFix('{"fixed":"Hi."}').fixes, []);
const p = buildPrompt({ question_en: 'Q?', kind: 'describe', stage: 9, transcript: 'uh' });
assert.match(p, /S9/); assert.match(p, /13단어/, '모르는 단계는 S1 기준');
console.log('✓ 스피킹 교정 — 출력 해석·프롬프트');
import { bakeTexts } from './speak-fix.mjs';
const split = t => (t.match(/[^.!?]+[.!?]*/g) || []).map(x => x.trim());
assert.deepEqual(bakeTexts({ fixed:'I live here. I like it.', fixes:[{ better:'I live here.' }, { better:'On weekends' }] }, split),
  ['I live here.', 'I like it.', 'On weekends'], '문장 + 고친 표현, 중복 없이');
console.log('✓ 스피킹 교정 — 구울 문장');

// 섀도잉 자막: 자동자막의 되풀이 줄·태그를 걷고 문장으로 묶는다
{
  const auto = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi I<00:00:01.500><c> get</c> up\n\n00:00:02.000 --> 00:00:02.010\nhi I get up\n\n00:00:02.010 --> 00:00:04.000\nhi I get up\nat seven.\n\n00:00:05.000 --> 00:00:06.000\n[Music]\n\n00:00:06.000 --> 00:00:07.000\nWhat&#39;s next?`;
  const l = vttLines(auto);
  assert.deepEqual(l.map(x => x.en), ['hi I get up at seven.', "What's next?"]);
  assert.equal(l[0].t, 1);
  assert.deepEqual([...parseKo('ok\n{"0":"가","2":"나","3":""}')], [[0, '가'], [2, '나']]);
  assert.deepEqual([...parseKo('{"0":"가 "다" 라","1":"나"}\n{"5":"x"}')], [[1, '나'], [5, 'x']]);   // 깨진 JSON
}
console.log('✓ vttLines·parseKo');

{
  const t = parseTips('정리:\n[{"t":"75.4","head":"MP 먼저","body":"핵심부터","ex":["I live in Seoul."],"kinds":["describe","nope"]},{"head":"빈 몸"}]');
  assert.equal(t.length, 1); assert.equal(t[0].t, 75); assert.deepEqual(t[0].kinds, ['describe']);
}
console.log('✓ parseTips');

{
  const sec = (t, n) => ({ title: t, why: 'w', items: Array.from({ length: n }, (_, i) => ({ head: 'h' + i, body: 'b', stage: 9, kinds: ['past', 'x'], refs: [{ v: 'A', t: '3.6' }, { v: 'ZZ', t: 1 }] })) });
  const g = parseGuide('공략:\n' + JSON.stringify({ summary: 's', sections: [sec('a', 2), sec('b', 1), sec('c', 1), { title: 'd', items: [] }] }), ['A']);
  assert.equal(g.sections.length, 3); assert.equal(g.sections[0].items[0].stage, 0);
  assert.deepEqual(g.sections[0].items[0].refs, [{ v: 'A', t: 4 }]); assert.deepEqual(g.sections[0].items[0].kinds, ['past']);
  assert.throws(() => parseGuide(JSON.stringify({ summary: 's', sections: [sec('a', 1)] }), ['A']));
}
console.log('✓ parseGuide');

// 고친 표현 → 복습 카드: ko 없는 건 버리고, 정답은 고친 문장, 내일부터
import { fixCards } from './speak-fix.mjs';
{
  const c = fixCards({ fixes:[{ said:'I go home weekend', better:'I usually stay home on weekends.', ko:'주말엔 보통 집에 있다고 말해봐', why_ko:'on weekends' },
                              { better:'No ko here.' }] }, { user_id:'u', ref:'r1', tomorrow:'2026-11-18' });
  assert.equal(c.length, 1, 'ko 없는 표현은 카드로 못 낸다');
  assert.deepEqual([c[0].prompt_ko, c[0].answer_en, c[0].source, c[0].next_review, c[0].status], ['주말엔 보통 집에 있다고 말해봐', 'I usually stay home on weekends.', 'speak', '2026-11-18', 'learning']);
  assert.match(c[0].note, /내가 한 말: I go home weekend/);
  console.log('✓ 교정 → 카드');
}

// 「한국어로 먼저」 — 영어 문장들 + 돌려 말하기, 문장 끝 보정, 내 문장이 카드가 된다
import { parseKoFix, koCards, buildKoPrompt } from './speak-fix.mjs';
{
  const j = parseKoFix('```json\n{"intent_ko":"집 얘기","lines":[{"en":"My house is small","ko":"우리 집은 작다고 말해봐"},{"en":"I like it.","ko":"마음에 든다고"},{"ko":"영어 없음"}],"swaps":[{"ko":"뒹굴다","en":"lie on the sofa"}],"tip_ko":"짧게"}\n```');
  assert.deepEqual(j.lines.map(l => l.en), ['My house is small.', 'I like it.'], '영어 없는 줄은 버리고 끝에 마침표');
  assert.equal(j.fixed, 'My house is small. I like it.');
  assert.deepEqual(j.fixes, []);
  const c = koCards(j, { user_id:'u', ref:'r', tomorrow:'2026-11-18' });
  assert.deepEqual(c.map(x => [x.prompt_ko, x.answer_en]), [['우리 집은 작다고 말해봐', 'My house is small.'], ['마음에 든다고', 'I like it.']]);
  assert.throws(() => parseKoFix('{"lines":[]}'), /lines 없음/);
  assert.match(buildKoPrompt({ question_en:'Q', kind:'describe', stage:1, transcript:'우리 집은 작아' }), /S1[\s\S]*현재시제/);
  console.log('✓ 한국어로 먼저');
}
