#!/usr/bin/env node
/**
 * 밤 보급 재고 + 오늘 만들 양. /eng-pack 이 맨 처음 돌리고 **이 숫자대로** 만든다.
 *
 *   node eng-stock.mjs          사람이 읽는 표
 *   node eng-stock.mjs --json   { plan:{ scenes:{L2,L3}, article, prompts:{kind:n} }, ... }
 *
 * 🔴 왜 있나: 밤마다 장면 4~5개 + 기사 1개를 감으로 만들었는데, 사용자가 판을 연 날이 6일뿐이라
 * 장면 94개 중 8개, 기사 19개 중 4개만 썼다. 게다가 절반이 L3 라 S3(12월) 전엔 못 쓴다.
 * 만드는 양을 **쓰는 양**에 맞춘다 — 사용자의 단계(eng_progress.stage)가 그걸 정한다.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

/** 재고 → 오늘 만들 양. 순수 함수다 (check-stock.mjs 가 1월까지 굴려본다). */
export function plan({ STAGES, stage, freeL2, freeL3, freeAr, lastAr, today, yday, kinds }){
  const st = STAGES[stage], nx = STAGES[Math.min(stage + 1, 4)];
  // 장면: **앞으로 3주** 동안 각 난이도를 얼마나 쓸지 — 지금 단계와 다음 단계를 반반으로 본다.
  //   🔴 다음 단계까지 봐야 한다. S1 은 장면이 선택이라 거의 안 쓰지만 S2 에 올라가는 순간
  //   필수가 된다. 지금 단계만 보고 줄이면 S2 끝무렵 L2 가 바닥난다 (check-stock 이 실제로 잡았다).
  //   단계별 하루 장면 수(scN)는 앱의 STAGES 가 정한다. 필수가 아니면 하루 1개쯤 쓴다고 본다.
  const use = x => x.board.req.includes('scene') ? x.scN : 1;
  const l2 = x => x.scMax <= 2 ? 1 : 0.5;            // S3~ 는 L2·L3 가 섞여 뽑힌다
  const want2 = 21 * (l2(st) * use(st) + l2(nx) * use(nx)) / 2;
  const want3 = 21 * ((1 - l2(st)) * use(st) + (1 - l2(nx)) * use(nx)) / 2;
  // 쿠션 아래면 2개, 쿠션의 1.5배 아래면 1개, 넉넉하면 0개
  const make = (free, want) => free < want ? 2 : free < want * 1.5 ? 1 : 0;
  const L2 = make(freeL2, want2), L3 = make(freeL3, want3);
  // 기사: 뉴스가 나오는 단계(S3~)를 위해 쌓아둔다. 넉넉하면 안 만들고, 아니면 이틀에 하나
  // (뉴스가 나오는 단계면 매일).
  const newsNow = st.board.req.includes('article') || st.board.opt.includes('article');
  const arNeed = 35;   // S3(선택)·S4(필수) 합쳐 5주쯤
  const article = freeAr >= arNeed ? false
    : newsNow ? lastAr !== today
    : lastAr !== today && lastAr !== yday;
  // 문항: 지금 단계 유형 중 가장 적은 것부터 4개. S1 이면 묘사·습관·질문하기만 늘린다.
  const kc = {};
  for (const k of st.kinds) kc[k] = 0;
  for (const k of kinds) if (k in kc) kc[k]++;
  const order = Object.entries(kc).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const prompts = {};
  for (let i = 0; i < 4; i++) prompts[order[i % order.length]] = (prompts[order[i % order.length]] || 0) + 1;
  return { scenes:{ L2, L3 }, article, prompts, kc };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {

const JSON_OUT = process.argv.includes('--json');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app  = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
// 단계표는 앱에서 읽는다 — 베껴 두면 단계를 고쳐도 보급이 옛 기준으로 만든다
const STAGES = new Function(app.slice(app.indexOf('const STAGES = {'), app.indexOf('const PROMOTE =')) + '; return STAGES;')();

const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
                        html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1], { auth:{ persistSession:false } });
const { data: auth, error: e0 } = await sb.auth.signInWithPassword({
  email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
if (e0) { console.error('✗ 로그인 실패:', e0.message); process.exit(1); }
const uid = auth.user.id;

const [sc, ar, se, pg, pr] = await Promise.all([
  sb.from('eng_scenes').select('id, level, created_at').eq('status', 'ready'),
  sb.from('eng_articles').select('id, created_at'),
  sb.from('eng_sessions').select('scene_ids, article_id').eq('user_id', uid),
  sb.from('eng_progress').select('stage').eq('user_id', uid).maybeSingle(),
  sb.from('eng_prompts').select('kind, model_l1'),
]);
for (const r of [sc, ar, se, pr]) if (r.error) { console.error('✗', r.error.message); process.exit(1); }

const stage = pg.data?.stage || 1, st = STAGES[stage];
const usedSc = new Set((se.data || []).flatMap(r => r.scene_ids || []));
const usedAr = new Set((se.data || []).map(r => r.article_id).filter(Boolean));
const free = lv => sc.data.filter(x => x.level === lv && !usedSc.has(x.id)).length;
const freeL2 = free(2), freeL3 = free(3);
const freeAr = ar.data.filter(x => !usedAr.has(x.id)).length;
const kst = t => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const today = kst(Date.now()), yday = kst(Date.now() - 864e5);
const lastAr = ar.data.map(x => kst(x.created_at)).sort().pop() || null;

// ── 오늘 만들 양 ─────────────────────────────────────
const p = plan({ STAGES, stage, freeL2, freeL3, freeAr, lastAr, today, yday, kinds: pr.data.map(x => x.kind) });
const { L2, L3 } = p.scenes, { article, prompts, kc } = p;
const sceneReq = st.board.req.includes('scene');
const newsNow = st.board.req.includes('article') || st.board.opt.includes('article');
const noL1 = pr.data.filter(p => !p.model_l1).length;

const out = {
  stage, stageName: st.name, scMax: st.scMax,
  stock: { freeL2, freeL3, freeArticles: freeAr, lastArticle: lastAr, promptsByKind: kc, promptsWithoutL1: noL1 },
  plan: { scenes: { L2, L3 }, article, prompts },
};
if (JSON_OUT) { console.log(JSON.stringify(out)); await sb.auth.signOut(); process.exit(0); }

console.log(`사용자 단계  S${stage} ${st.name} (장면 L${st.scMax} 까지${sceneReq ? ' · 필수' : ' · 선택'}${newsNow ? '' : ' · 뉴스 없음'})`);
console.log(`안 쓴 재고   장면 L2 ${freeL2} · L3 ${freeL3} · 기사 ${freeAr} (마지막 기사 ${lastAr || '-'})`);
console.log(`문항 재고    ${Object.entries(kc).map(([k, n]) => `${k} ${n}`).join(' · ')}${noL1 ? ` · ⚠ S1 답 없는 문항 ${noL1}` : ''}`);
console.log(`오늘 만들 것 장면 L2 ${L2} · L3 ${L3} · 기사 ${article ? 1 : 0} · 문항 ${Object.entries(prompts).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
await sb.auth.signOut();
}
