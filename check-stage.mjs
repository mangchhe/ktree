#!/usr/bin/env node
/** 커리큘럼 단계 검사.
 *  왜: 출발점이 NH 다. 단계표가 어긋나면 (S1 에 롤플레이가 섞이거나, 승급이 하루 중간에
 *  일어나 다 한 판이 미완이 되거나, 문법이 비는 날이 생기거나) "올라가는 재미" 가 바로 깨진다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, `추출 실패: ${a}`); return html.slice(i, j); };
const block = cut('const STAGES = {', '/* GRAMMAR 끝') +
  cut('function todayGrammar(){', '\n}\n') + '\n}\n';
const KL = new Function(cut('const KIND_LABEL =', ';\n') + '; return KIND_LABEL;')();

let TODAY = '2026-10-22', DB = null, wrote = null;
const env = new Function('ctx', `
  const today = () => ctx.today();
  const kstDate = t => new Date((t == null ? Date.now() : t) + 9*3600e3).toISOString().slice(0,10);
  const toast = () => {};
  const currentUser = { id:'u1' };
  const sb = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ctx.db() }) }) }),
    upsert: async row => { ctx.wrote(row); return {}; },
  }) };
  ${block}
  return { STAGES, PROMOTE, GRAMMAR, stageGot, todayGrammar, loadStage, setStage,
           get: () => ({ tStage, tStageSince, tStageNext }),
           set: (n, since) => { tStage = n; tStageSince = since; } };`)({
  today: () => TODAY, db: () => DB, wrote: r => { wrote = r; } });
const { STAGES, PROMOTE, GRAMMAR, stageGot, todayGrammar } = env;

// 1) 단계표 — 올라갈수록 길어지고, 유형은 쌓이기만 한다
const BOARD = new Set(['grammar','speak','scene','article','vocab', 'shadow']);
for (let n = 1; n <= 4; n++) {
  const x = STAGES[n], prev = STAGES[n - 1];
  assert.ok(x.kinds.every(k => KL[k]), `S${n}: 모르는 유형`);
  if (prev) {
    assert.ok(x.sec > prev.sec, `S${n}: 목표 시간이 안 늘었다`);
    assert.ok(prev.kinds.every(k => x.kinds.includes(k)), `S${n}: 앞 단계 유형이 빠졌다`);
  }
  assert.ok([...x.board.req, ...x.board.opt].every(k => BOARD.has(k)), `S${n}: 모르는 칸`);
  assert.ok(!x.board.req.some(k => x.board.opt.includes(k)), `S${n}: 필수이면서 선택인 칸`);
  assert.ok(x.board.req.includes('speak'), `S${n}: Speaking 이 필수가 아니다 — 시험은 말하기다`);
}
assert.deepStrictEqual(STAGES[1].kinds.sort(), ['ask','describe','habit'], 'S1 은 현재시제로 끝나는 유형만');
assert.ok(!STAGES[1].board.req.includes('scene') && !STAGES[1].board.req.includes('article'),
  'S1 에 장면·뉴스가 필수면 NH 가 원어민 속도 대화를 매일 넘어야 한다');

// 2) 문법 — 단계마다 있고, 예문이 짧다
for (let n = 1; n <= 4; n++) assert.ok(GRAMMAR.filter(g => g.st === n).length >= 3, `S${n}: 문법이 3개 미만`);
for (const g of GRAMMAR) {
  assert.ok(g.name && g.why?.length > 15 && g.try, `${g.name}: 설명이 비었다`);
  assert.ok(g.ex.length >= 5, `${g.name}: 예문은 5개 이상`);
  assert.ok(g.form?.length && g.form.every(r => r.length === 2 && r[1]), `${g.name}: 꼴 표가 비었거나 칸이 어긋남`);
  assert.ok(g.oops?.length && g.oops.every(r => r.length === 3), `${g.name}: 자주 틀리는 것 [틀린, 맞는, 왜]`);
  for (const [en, ko] of g.ex) {
    assert.ok(en && ko, `${g.name}: 예문 짝이 비었다`);
    assert.ok(en.split(/\s+/).length <= 10, `${g.name}: "${en}" — 예문이 길면 따라하기가 안 된다`);
  }
}

// 3) 승급 실적 — 목표 시간 넘김 + Again 아님 + 이 단계 이후만
const rows = [
  { done_on:'2026-10-20', spoke_ms:40e3, self_grade:'good' },   // 단계 전 → 안 센다
  { done_on:'2026-10-22', spoke_ms:31e3, self_grade:'ok' },
  { done_on:'2026-10-22', spoke_ms:35e3, self_grade:'good' },
  { done_on:'2026-10-23', spoke_ms:29e3, self_grade:'good' },   // 30초 미달
  { done_on:'2026-10-23', spoke_ms:60e3, self_grade:'again' },  // Again
  { done_on:'2026-10-24', spoke_ms:45e3, self_grade:null },     // 채점 안 함
  { done_on:'2026-10-24', spoke_ms:45e3, self_grade:'ok' },
];
assert.deepStrictEqual(stageGot(rows, 30, '2026-10-21'), { answers:3, days:2 });

// 4-0) 단계 첫날이 비어 있으면 오늘로 적는다 — 안 적으면 문법이 첫 개에 영원히 멈춘다
DB = { stage:1, stage_since:null }; wrote = null;
await env.loadStage();
assert.deepStrictEqual(wrote, { user_id:'u1', stage:1, stage_since:'2026-10-22' }, '빈 stage_since 를 안 채웠다');
assert.strictEqual(env.get().tStageSince, '2026-10-22');

// 4) 승급은 다음 날부터 — 하루 중간에 판의 완주 조건이 바뀌면 안 된다
DB = { stage:2, stage_since:'2026-10-23' };   // 오늘(22일) 승급해서 내일부터
await env.loadStage();
assert.deepStrictEqual(env.get(), { tStage:1, tStageSince:null, tStageNext:true }, '승급 당일인데 벌써 S2 가 됐다');
TODAY = '2026-10-23';
await env.loadStage();
assert.deepStrictEqual(env.get(), { tStage:2, tStageSince:'2026-10-23', tStageNext:false }, '다음 날인데 S2 가 아니다');
// 손으로 바꾼 건 바로
await env.setStage(3);
assert.strictEqual(env.get().tStage, 3, '순서 탭에서 바꾼 단계가 바로 적용 안 됐다');
assert.deepStrictEqual(wrote, { user_id:'u1', stage:3, stage_since:'2026-10-23' });

// 5) 오늘 문법 — 단계 첫날이 0번째, 순서대로, 다 돌면 처음부터
env.set(1, '2026-10-22');
const s1 = GRAMMAR.filter(g => g.st === 1);
TODAY = '2026-10-22'; assert.strictEqual(todayGrammar(), s1[0], '단계 첫날은 첫 문법');
TODAY = '2026-10-24'; assert.strictEqual(todayGrammar(), s1[2]);
TODAY = kst(Date.parse('2026-10-22T00:00:00+09:00') + s1.length * 864e5);
assert.strictEqual(todayGrammar(), s1[0], '다 돌면 처음부터 복습');
env.set(4, '2026-10-22'); TODAY = '2026-10-22';
assert.strictEqual(todayGrammar(), GRAMMAR[0], 'S4 는 앞 단계 전체를 복습한다');
function kst(t){ return new Date(t + 9*3600e3).toISOString().slice(0,10); }

// 6) 판 — 완주·퀴즈·판 그리기가 같은 칸 계산을 쓴다
const mc = cut('async function maybeComplete(', '/* 앱을 켜둔 채 자정');
assert.ok(/b\.req\.every\(partDone\)/.test(mc), '완주가 단계 req 를 안 본다');
const rt = cut('async function renderToday(', 'function actBar(');
assert.ok(/st\.board\.req\.every\(partDone\)/.test(rt), '퀴즈 잠금이 단계 req 를 안 본다');
assert.ok(/st\.board\.req\.includes\(k\) \|\| st\.board\.opt\.includes\(k\)/.test(rt), '단계에 없는 칸이 판에 나온다');

// 7) 출퇴근 트랙 — S1 은 장면·뉴스 없이 질문 + 짧은 답
const cu = cut('function commuteUrls(', '\n}\n') + '\n}\n';
const track = new Function('st', `
  const curStage = () => st, todayGrammar = () => ({ ex:[['G1.','g'],['G2.','g']] });
  const PROMPT_AUD = id => 'q/' + id, enUrl = t => 'e/' + t;
  const sentences = t => (String(t || '').match(/[^.!?]+[.!?]*/g) || []).map(x => x.trim()).filter(Boolean);
  const tPrompts = [{ id:'p1', model_l1:'A one. B two.' }];
  const tScenes = [{ full_url:'scene.mp3' }], tArticle = { audio_url:'news.mp3' };
  ${cu}; return commuteUrls('all');`);
const t1 = track(STAGES[1]).flat();
assert.ok(!t1.includes('scene.mp3') && !t1.includes('news.mp3'), 'S1 트랙에 장면·뉴스가 섞였다');
assert.deepStrictEqual(t1, ['e/G1.', 'e/G2.', 'q/p1', 'e/A one.', 'e/B two.'], 'S1 트랙 순서: 문법 → 질문 → 그 답');
const t4 = track(STAGES[4]).flat();
assert.ok(t4.includes('scene.mp3') && t4.includes('news.mp3') && !t4.includes('e/A one.'), 'S4 트랙은 장면·뉴스·질문');

// 8) 보관함도 단계를 따른다 — 판은 S1 인데 보관함이 L3·뉴스를 띄우면 다시 "너무 어렵다" 가 된다
const av = cut('async function renderArchive(', 'box.querySelectorAll(\'[data-sc]\')');
assert.ok(/list\('eng_scenes', x => x\.lte\('level', st\.scMax\)\)/.test(av), '보관함 장면이 단계 난이도를 안 본다');
assert.ok(/news \? list\('eng_articles'/.test(av), '보관함 뉴스가 단계를 안 본다');
assert.ok(/count\('eng_scenes', x => x\.gt\('level', st\.scMax\)\)/.test(av), '잠긴 재료 수를 안 센다 — 사라진 줄 안다');
// 하루 장면 수도 단계가 정한다
assert.ok(/slice\(0, curStage\(\)\.scN\)/.test(html), '하루 장면 수가 단계를 안 따른다');
for (let n = 2; n <= 4; n++) assert.ok(STAGES[n].scN >= STAGES[n - 1].scN, `S${n}: 장면 수가 줄었다`);

console.log(`✓ 단계 — 4단계 · 문법 ${GRAMMAR.length}개 · 승급 ${PROMOTE.answers}답/${PROMOTE.days}일, 다음 날 적용`);
