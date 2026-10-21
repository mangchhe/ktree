#!/usr/bin/env node
/** 보관함 다시 보기 — 오늘 판을 건드리지 않는다.
 *  왜: 보관함에서 연 장면이 tScenes 를 바꿔치기해서, 오늘 장면이 사라지고 / 끝내면 오늘 Scenes 가
 *  1/1 완료로 찍히고 / 저장 전이면 옛 장면이 오늘 판에 박혔다. 뉴스는 오늘 기사가 덮였다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, `추출 실패: ${a}`); return html.slice(i, j); };
const rp = cut('let tReplay = null;', 'const curStage =');
const sp = cut('async function saveProgress(', 'function paintXp(');
const mc = cut('async function maybeComplete(', '/* 앱을 켜둔 채 자정');

const run = new Function(`
  let tScenes = [{id:'today-1'},{id:'today-2'}], tArticle = {id:'today-art'};
  let tSession = { session_date:'2026-10-22', progress:{} }, tGain = 0, wrote = 0, stamped = 0;
  const tVocab = { today:[], past:[] }, currentUser = { id:'u' }, today = () => '2026-10-22';
  const sessDay = () => tSession.session_date;
  const sb = { from: () => ({ upsert: () => { wrote++; return { select: () => ({ maybeSingle: async () => ({ data:null }) }) }; },
                              update: () => { stamped++; return { eq: () => ({ eq: async () => ({}) }) }; } }) };
  const curStage = () => ({ board:{ req:['scene'], quiz:false } });
  const partDone = () => true, bumpXp = async () => {};
  ${rp}
  ${sp}
  ${mc}
  return async () => {
    // 보관함에서 장면을 열고 끝까지 본다
    replay({ scenes:[{id:'old-1'}] });
    const during = tScenes.map(x => x.id);
    await saveProgress({ scenes:{ done:1, total:1 } });
    await maybeComplete();
    // 뉴스도 연다 (앞의 맡김은 유지돼야 한다)
    replay({ article:{id:'old-art'} });
    await saveProgress({ article:{ sent:5, total:5 } });
    endReplay();
    return { during, after: tScenes.map(x => x.id), art: tArticle.id, wrote, stamped, progress: tSession.progress };
  };`)();

const r = await run();
assert.deepStrictEqual(r.during, ['old-1'], '다시 보기 중엔 그 장면이 열려야 한다');
assert.strictEqual(r.wrote, 0, '다시 보기가 오늘 진도를 저장했다 — 오늘 Scenes 가 가짜로 찬다');
assert.strictEqual(r.stamped, 0, '다시 보기가 오늘 완주를 찍었다');
assert.deepStrictEqual(r.after, ['today-1','today-2'], '돌아왔는데 오늘 장면이 안 돌아왔다');
assert.strictEqual(r.art, 'today-art', '돌아왔는데 오늘 기사가 옛 기사로 남았다');
assert.deepStrictEqual(r.progress, {}, '오늘 진도가 바뀌었다');

// 화면을 떠나는 두 길 모두 끝낸다 + 보관함은 show('today') **뒤에** 건다(안 그러면 바로 풀린다)
assert.ok(/async function renderToday\(\)\{\n  endReplay\(\);/.test(html), '뒤로 가기에서 안 되돌린다');
assert.ok(/function show\(s\)\{\n  endReplay\(\);/.test(html), '탭 이동에서 안 되돌린다 — 그동안 저장이 막힌다');
const av = cut("box.querySelectorAll('[data-sc]')", "/* 세 칸을 다 채웠으면");
assert.ok(/show\('today'\);\n    setTimeout\(\(\) => \{ replay\(/.test(av), '보관함이 replay 를 show 앞에 건다 — 열자마자 풀린다');

console.log('✓ 다시 보기 — 오늘 판의 장면·기사·진도·완주를 안 건드린다');
