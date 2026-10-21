#!/usr/bin/env node
/** 밤 보급 양 검사 — 지금 재고에서 1월 재시험까지 76일을 굴린다.
 *  왜: 감으로 만들 때 장면 94개 중 8개만 쓰였다(넘침). 반대로 줄이기만 하면 S2 에 올라가
 *  하루 4개씩 쓰기 시작할 때 바닥난다. 둘 다 안 생기는지 본다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { plan } from './eng-stock.mjs';

const app = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const STAGES = new Function(app.slice(app.indexOf('const STAGES = {'), app.indexOf('const PROMOTE =')) + '; return STAGES;')();
const kst = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

// 오늘 실재고(eng-stock.mjs 실측, 2026-10-21)에서 출발. 단계는 페이스 기준선(by)대로 오른다고 둔다.
let freeL2 = 38, freeL3 = 48, freeAr = 15, lastAr = '2026-10-21', made = 0, low = Infinity, high = 0;
const start0 = freeL2 + freeL3;
const start = Date.parse('2026-10-22T00:00:00+09:00');
for (let d = 0; d < 76; d++) {
  const t = start + d * 864e5, today = kst(t), yday = kst(t - 864e5), md = today.slice(5);
  // 페이스 기준선(by)대로 오른다고 둔다 — 늦게 오르면 소모가 줄 뿐이라 더 안전하다
  const stage = today <= '2026-11-11' ? 1 : today <= '2026-12-02' ? 2 : today <= '2026-12-23' ? 3 : 4;
  const st = STAGES[stage];
  const p = plan({ STAGES, stage, freeL2, freeL3, freeAr, lastAr, today, yday, kinds:[] });
  freeL2 += p.scenes.L2; freeL3 += p.scenes.L3; made += p.scenes.L2 + p.scenes.L3;
  if (p.article) { freeAr++; lastAr = today; }
  // 쓰는 양: 장면 필수면 하루 scN 개(S3~ 는 L2·L3 반반), 선택이면 하루 1개
  const use = st.board.req.includes('scene') ? st.scN : 1;
  if (st.scMax <= 2) freeL2 -= use; else { freeL2 -= use / 2; freeL3 -= use / 2; }
  if (st.board.req.includes('article')) freeAr -= 1; else if (st.board.opt.includes('article')) freeAr -= 0.5;
  low = Math.min(low, st.scMax <= 2 ? freeL2 : freeL2 + freeL3);
  high = Math.max(high, freeL2 + freeL3);
  assert.ok(freeL2 >= 0 && freeL3 >= 0, `${today} S${stage}: 장면이 바닥났다 (L2 ${freeL2} · L3 ${freeL3})`);
  assert.ok(freeAr >= 0, `${today} S${stage}: 기사가 바닥났다`);
}
// 넘치지도 않아야 한다 — "넘친다"는 만드는 속도가 아니라 **안 쓴 재고가 불어나는 것**이다
// (S4 는 하루 4개를 쓰니 그만큼 만드는 게 정상). 예전엔 94개 만들어 8개 써서 하루 4개씩 불었다.
assert.ok(high <= start0 + 15, `안 쓴 장면이 ${Math.round(high)}개까지 불었다 (시작 ${start0}) — 다시 쌓인다`);
// S1 은 장면이 선택이라 거의 안 쓴다 — 여기서 하루 2개씩 만들면 그게 예전 실수다
const s1 = plan({ STAGES, stage:1, freeL2:38, freeL3:48, freeAr:15, lastAr:'2026-10-21', today:'2026-10-22', yday:'2026-10-21', kinds:[] });
assert.ok(s1.scenes.L2 + s1.scenes.L3 <= 1, `S1 에서 하루 ${s1.scenes.L2 + s1.scenes.L3}개 — 쓰는 양보다 많다`);
console.log(`✓ 밤 보급 양 — 76일 바닥 안 남(최저 ${Math.round(low)}) · 안 쓴 재고 최대 ${Math.round(high)}(시작 ${start0}) · ` +
  `만든 장면 ${made}개 · 끝 재고 L2 ${Math.round(freeL2)} · L3 ${Math.round(freeL3)} · 기사 ${Math.round(freeAr)}`);
