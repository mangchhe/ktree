#!/usr/bin/env node
/** 자정 넘김 검사 — 앱을 켜둔 채 날짜가 바뀌어도 어제 진도가 오늘로 복사되면 안 된다.
 *  왜: 실측으로 10-21 00:00:59 에 어제 진도·XP·장면 4개가 오늘 행으로 그대로 들어와,
 *  손도 안 댄 오늘이 완료로 찍히고 어제 장면이 오늘 판에 박혔다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('/* 판을 세운 날짜.'), html.indexOf('function paintXp('));
assert.ok(src.includes('sessDay()'), '추출 실패 — 함수 경계가 바뀌었다');

let row = null;
const make = new Function('TODAY', 'SESSION', `
  let tSession = SESSION, tGain = 5, tArticle = null, tScenes = [{id:'new-1'}], captured = null;
  const tVocab = { today:[], past:[] };
  const currentUser = { id:'u1' };
  const today = () => TODAY;
  const sb = { from: () => ({ upsert: r => { captured = r; return { select: () => ({ maybeSingle: async () => ({ data:null }) }) }; } }) };
  ${src}
  return async patch => { await saveProgress(patch); return { captured, sessDay: sessDay() }; };`);

const yesterday = { session_date:'2026-10-20', progress:{ scenes:{done:4,total:4}, vocab:{done:12,total:12} },
                    scene_ids:['a','b','c','d'], vocab_ids:['v1'], xp_earned:728 };

// 1) 자정을 넘겨서 저장해도 **어제 행**에 들어간다
({ captured: row } = await make('2026-10-21', yesterday)('vocab', { vocab:{done:12,total:12} }).then(r => r)
  .catch(e => { throw e; }));
assert.strictEqual(row.session_date, '2026-10-20',
  `어제 판을 하던 중인데 ${row.session_date} 행에 썼다 — 오늘이 복사된다`);
assert.deepStrictEqual(row.scene_ids, ['a','b','c','d'], '장면이 바뀌면 안 된다');

// 2) 세션이 없으면(새 날 첫 저장) 오늘 행을 만들고 **아무것도 물려받지 않는다**
({ captured: row } = await make('2026-10-21', null)({ scenes:{done:1,total:4} }));
assert.strictEqual(row.session_date, '2026-10-21', '새 날은 오늘 행이어야 한다');
assert.deepStrictEqual(row.progress, { scenes:{done:1,total:4} }, '어제 진도가 섞였다');
assert.deepStrictEqual(row.scene_ids, ['new-1'], '오늘 고른 장면이어야 한다');
assert.strictEqual(row.xp_earned, 5, '어제 XP 가 넘어왔다');

// 3) 완주 도장도 같은 행에 찍는다 — today() 로 찍으면 빈 오늘이 완료된다
const mc = html.slice(html.indexOf('async function maybeComplete('), html.indexOf('/* 앱을 켜둔 채 자정'));
assert.ok(/eq\('session_date', sessDay\(\)\)/.test(mc), '완주 도장이 아직 today() 로 찍힌다');

// 4) 돌아올 때 날짜가 바뀌었으면 판을 다시 세운다
const vis = html.slice(html.indexOf("addEventListener('visibilitychange'"), html.indexOf('/* ================= init'));
assert.ok(/tSession\.session_date === today\(\)/.test(vis) && /loadToday\(\)/.test(vis),
  '포그라운드로 돌아올 때 날짜 변화를 안 본다 — 어제 판을 오늘인 줄 알고 본다');

console.log('✓ 자정 넘김 — 진도는 그 판의 날짜로, 새 날은 빈 판으로');
