// speak-fix.mjs 의 교정 출력 해석·프롬프트. node check-speakfix.mjs
import assert from 'node:assert/strict';
import { parseFix, buildPrompt } from './speak-fix.mjs';

const j = parseFix('여기 있어:\n```json\n{"intent_ko":"a","fixed":"I live in Seoul.","fixes":[{"said":"I living","better":"I live","why_ko":"x"},{"said":"x"}]}\n```');
assert.equal(j.fixed, 'I live in Seoul.');
assert.equal(j.fixes.length, 1, 'better 없는 항목은 버린다');
assert.throws(() => parseFix('죄송해요'), /JSON 없음/);
assert.throws(() => parseFix('{"fixes":[]}'), /fixed 없음/);
assert.deepEqual(parseFix('{"fixed":"Hi."}').fixes, []);
const p = buildPrompt({ question_en: 'Q?', kind: 'describe', stage: 9, transcript: 'uh' });
assert.match(p, /S9/); assert.match(p, /13단어/, '모르는 단계는 S1 기준');
console.log('✓ 스피킹 교정 — 출력 해석·프롬프트');
