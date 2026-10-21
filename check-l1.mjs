#!/usr/bin/env node
/** S1 답 규칙 검사 — 막아야 할 것은 막고, S1 문법은 막지 않는다.
 *  왜: 처음엔 which·kind of 를 통째로 막아서 "Which city did you visit?" 같은 의문사 질문까지
 *  걸렸다. 그건 S1 이 가르치는 문법이다. 반대로 느슨하게 풀면 IM 문장이 S1 답으로 샌다. */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { checkL1 } from './l1-rules.mjs';

const ok = t => assert.deepStrictEqual(checkL1(t), [], `막으면 안 된다: ${t} → ${checkL1(t)}`);
const no = (t, why) => assert.ok(checkL1(t).some(x => x.includes(why)), `막아야 한다(${why}): ${t}`);

ok('Welcome back! Which city did you visit? What did you eat? Was it fun?');        // 의문사 which
ok('I have questions. What kind of job do you want? Is the pay good? When is it?'); // what kind of
ok('I live in an apartment. It is small but clean. There is a park near my home.');
no('I live in a flat. It has a park, which is nice. I like it a lot.', '관계대명사');
no('I was tired. It was kind of a long day. I went to bed early.', 'kind of');
no('What I like most is actually the location. It is near a park. I like it.', 'IM 이상');
no('I like it. It is nice.', '문장 2개');
no('I go to a really big and very quiet park near my apartment every single weekend morning. It is nice. I like it.', '단어');

// 백필 파일 전체가 규칙을 통과해야 한다 — 손으로 고치다 하나가 새는 걸 막는다
const all = JSON.parse(readFileSync(new URL('./drafts/english/model-l1-backfill.json', import.meta.url), 'utf8'));
const fails = Object.entries(all).filter(([, t]) => checkL1(t).length);
assert.deepStrictEqual(fails.map(([k]) => k), [], 'S1 답 백필 중 규칙을 어긴 것이 있다');

console.log(`✓ S1 답 규칙 — 막을 것만 막는다 · 백필 ${Object.keys(all).length}개 전부 통과`);
