#!/usr/bin/env node
/**
 * S1 답(model_l1) 일괄 반영 — drafts/english/model-l1-backfill.json ({ id앞8자리: 답 }).
 *
 *   node backfill-l1.mjs --dry   검증만
 *   node backfill-l1.mjs         검증 통과하면 반영
 *
 * 🔴 하나라도 규칙(l1-rules.mjs)을 어기거나 id 가 안 맞으면 **아무것도 안 쓴다.**
 * 섞여 들어간 어려운 답 하나가 그날 따라 말하기를 막는다.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { checkL1 } from './l1-rules.mjs';

const DRY = process.argv.includes('--dry');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
                        html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1],
                        { auth:{ persistSession:false } });
const { error: e0 } = await sb.auth.signInWithPassword({
  email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
if (e0) { console.error('✗ 로그인 실패:', e0.message); process.exit(1); }

const want = JSON.parse(readFileSync(new URL('./drafts/english/model-l1-backfill.json', import.meta.url), 'utf8'));
const { data: rows, error: e1 } = await sb.from('eng_prompts').select('id, kind, model_l1');
if (e1) { console.error('✗', e1.message); process.exit(1); }

const bad = [], plan = [];
for (const [pre, text] of Object.entries(want)) {
  const hit = rows.filter(r => r.id.startsWith(pre));
  if (hit.length !== 1) { bad.push(`${pre}: id 가 ${hit.length}개 맞는다`); continue; }
  const why = checkL1(text);
  if (why.length) bad.push(`${pre} (${hit[0].kind}): ${why.join(' · ')}`);
  else plan.push({ id: hit[0].id, text, was: hit[0].model_l1 });
}
const missing = rows.filter(r => !Object.keys(want).some(p => r.id.startsWith(p)) && !r.model_l1);
if (bad.length) { console.error('✗ 아무것도 안 썼다:\n  ' + bad.join('\n  ')); process.exit(1); }

console.log(`검증 통과 ${plan.length}개 · 새로 ${plan.filter(p => !p.was).length} · 덮어씀 ${plan.filter(p => p.was && p.was !== p.text).length}`);
if (missing.length) console.log(`⚠ S1 답이 없는 문항 ${missing.length}개 — 그 문항은 S1 에서 원래 답으로 떨어진다`);
if (DRY) { await sb.auth.signOut({ scope: 'local' }); process.exit(0); }

let ok = 0;
for (const p of plan) {
  const { error } = await sb.from('eng_prompts').update({ model_l1: p.text }).eq('id', p.id);
  if (error) console.error(`  ✗ ${p.id.slice(0,8)}: ${error.message}`); else ok++;
}
console.log(`✓ ${ok}/${plan.length}개 반영`);
await sb.auth.signOut({ scope: 'local' });
