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
