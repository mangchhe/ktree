// loadPrompts 의 뽑기 규칙만 떼어 실제 재고로 돌린다.
// 깨지면: 하루치가 3개가 안 되거나, 한 주제로 안 묶이거나, 주제가 안 돈다.
import { readFileSync } from 'fs';
import assert from 'assert';

const html = readFileSync('/Users/hajoo/prj/ktree/english.html', 'utf8');
const SPEAK_N = +html.match(/const SPEAK_N = (\d+)/)[1];
const COMBOS = eval(html.match(/const COMBOS = (\[[\s\S]*?\]);/)[1]);
const hashDay = eval('(' + html.match(/function hashDay\(d\)\{[\s\S]*?\n\}/)[0].replace('function hashDay', 'function') + ')');

// 재고 덤프: ./run-sql.sh 로 뽑은 id<TAB>topic<TAB>kind (헤더 없이)
//   echo "select id,topic,kind from eng_prompts;" > /tmp/r.sql
//   ./run-sql.sh /tmp/r.sql | tail -n +4 > /tmp/rows.tsv && node check-combo.mjs /tmp/rows.tsv
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n')
  .map(l => { const [id, topic, kind] = l.split('\t'); return { id, topic, kind }; })
  .filter(p => p.id && p.id !== 'id');
// 🔴 단계가 유형을 거른다(S1 은 묘사·습관·질문하기만). 거른 뒤에도 매일 3문항이 한 주제로
// 나와야 한다 — 단계마다 따로 굴린다.
const STAGES = new Function(html.slice(html.indexOf('const STAGES = {'), html.indexOf('const PROMOTE =')) + '; return STAGES;')();
let all = rows;

function pickFor(day, lastOf = {}) {
  const score = p => (!lastOf[p.id] ? 0 : 2);
  const best = (a, b) => score(a) - score(b) || (lastOf[a.id] || '').localeCompare(lastOf[b.id] || '');
  const byTopic = {};
  for (const p of all) (byTopic[p.topic] ||= []).push(p);
  const ranked = Object.keys(byTopic).sort((x, y) => {
    const fresh = t => byTopic[t].filter(p => !lastOf[p.id]).length;
    const touched = t => byTopic[t].map(p => lastOf[p.id] || '').sort()[byTopic[t].length - 1] || '';
    return fresh(y) - fresh(x) || touched(x).localeCompare(touched(y));
  });
  const topic = ranked.find(t => byTopic[t].length >= SPEAK_N) || ranked[0];
  const mine = byTopic[topic].slice().sort(best);
  const shape = COMBOS[Math.abs(hashDay(day)) % COMBOS.length];
  const pick = [];
  for (const k of shape) { const p = mine.find(x => x.kind === k && !pick.includes(x)); if (p) pick.push(p); }
  for (const p of mine) { if (pick.length >= SPEAK_N) break; if (!pick.includes(p)) pick.push(p); }
  return { topic, shape, pick: pick.slice(0, SPEAK_N) };
}

// 30일을 굴려본다 — 매일 3개, 한 주제, 중복 없음, 주제가 돌아야 한다
for (const [n, st] of Object.entries(STAGES)) {
all = rows.filter(p => st.kinds.includes(p.kind));
console.log(`— S${n} (${st.kinds.join('·')}) · 문항 ${all.length}개`);
const lastOf = {}, topicsSeen = new Set();
for (let i = 0; i < 30; i++) {
  const day = new Date(Date.UTC(2026, 9, 16 + i)).toISOString().slice(0, 10);
  const { topic, shape, pick } = pickFor(day, lastOf);
  assert.equal(pick.length, SPEAK_N, `${day}: ${pick.length}개만 나왔다`);
  assert.equal(new Set(pick.map(p => p.id)).size, SPEAK_N, `${day}: 같은 문항이 두 번`);
  assert(pick.every(p => p.topic === topic), `${day}: 주제가 섞였다`);
  topicsSeen.add(topic);
  if (i < 3) console.log(' ', day, topic, shape.join('→'), '=>', pick.map(p => p.kind).join(','));
  assert(pick.every(p => st.kinds.includes(p.kind)), `S${n} ${day}: 단계에 없는 유형이 나왔다`);
  for (const p of pick) lastOf[p.id] = day;
}
assert(topicsSeen.size >= 4, `S${n}: 주제가 ${topicsSeen.size}개만 돌았다`);
console.log(`✓ S${n} 30일 · 주제 ${topicsSeen.size}개 순환 · 매일 ${SPEAK_N}문항 한 주제`);
}
