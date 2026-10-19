// 찍기 표시 규칙. 깨지면 찍어둔 게 **안 보이고** 누르면 해제만 된다 (실제로 그랬다).
import { readFileSync } from 'fs';
import assert from 'assert';
const h = readFileSync('/Users/hajoo/prj/ktree/english.html', 'utf8');

// 1) 상태를 반영하지 않는 ☆ 하드코딩이 남아 있으면 안 된다
for (const m of h.matchAll(/<button[^>]*data-ft="[^"]*"[^>]*>([^<]*)<\/button>/g))
  assert.equal(m[1].trim(), '☆', `data-ft 버튼은 ☆ 로 그린 뒤 paintFlags 가 칠한다: ${m[0]}`);

// 2) data-ft 를 그리는 화면은 반드시 paintFlags 를 부른다
const screens = ['drawWarmup', 'paintTurns'];
for (const fn of screens) {
  const i = h.indexOf(`function ${fn}(`);
  assert(i > 0, `${fn} 가 없다`);
  const body = h.slice(i, h.indexOf('\n}', i));
  if (!body.includes('data-ft')) continue;
  assert(body.includes('paintFlags('), `${fn} 가 data-ft 를 그리는데 paintFlags 를 안 부른다`);
}

// 3) paintFlagBtn 은 긴 버튼과 짧은 버튼을 구분한다
const pb = h.slice(h.indexOf('function paintFlagBtn'), h.indexOf('/** ☆ 상태를'));
assert(pb.includes('dataset.long'), 'paintFlagBtn 이 긴/짧은 버튼을 안 가른다');
assert(pb.includes("'★'") && pb.includes("'★ 찍음'"), 'paintFlagBtn 에 두 모양이 다 없다');

// 4) 찍은 대화 줄(kind='line')은 매일 드릴 큐 세 질의 전부에서 빠져야 한다
const lv = h.slice(h.indexOf('async function loadTodayVocab'), h.indexOf('async function bumpXp'));
assert.equal((lv.match(/neq\('kind','line'\)/g) || []).length, 3,
  `드릴 큐 세 질의에 kind!=line 이 다 안 걸렸다 (${(lv.match(/neq\('kind','line'\)/g)||[]).length}/3)`);

console.log('✓ ☆ 는 그린 뒤 칠한다 · 긴/짧은 버튼 구분 · 대화 줄은 드릴 큐에서 빠진다');
