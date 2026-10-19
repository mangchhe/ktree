#!/usr/bin/env node
/**
 * 장면에 문법 패턴 하나씩 채운다.
 *
 *   node backfill-grammar.mjs [--dry]
 *
 * 🔴 넣기 전에 **en 이 그 turn 에 실제로 있는지** 확인한다. UI 가 "turn N" 이라고
 * 짚어 보여주므로, 어긋나면 엉뚱한 줄을 가리킨다 — 에러 없이 틀린 걸 가르치는 꼴이다.
 * 하나라도 안 맞으면 아무것도 넣지 않는다.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
                        html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1],
                        { auth: { persistSession: false } });
const { error: ae } = await sb.auth.signInWithPassword({
  email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
if (ae) { console.error('✗ 로그인 실패:', ae.message); process.exit(1); }

const want = JSON.parse(readFileSync(new URL('./drafts/english/grammar-backfill.json', import.meta.url), 'utf8'));
const { data: scenes, error } = await sb.from('eng_scenes').select('id, scene_id, turns').limit(2000);
if (error) { console.error('✗', error.message); process.exit(1); }

const norm = s => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const bad = [], rows = [];
for (const sc of scenes) {
  const g = want[sc.scene_id];
  if (!g) { bad.push(`${sc.scene_id}: 문법 데이터가 없다`); continue; }
  const turns = sc.turns || [];
  const t = turns[g.turn];
  if (!t) { bad.push(`${sc.scene_id}: turn ${g.turn} 이 없다 (턴 ${turns.length}개)`); continue; }
  const line = norm(t.en ?? t.text);
  if (!line.includes(norm(g.en)))
    bad.push(`${sc.scene_id}: turn ${g.turn} 에 그 조각이 없다\n      찾는 것: ${norm(g.en)}\n      실제 줄: ${line}`);
  else rows.push({ id: sc.id, grammar: g });
}
if (bad.length) {
  console.error(`✗ ${bad.length}건 안 맞음 — 아무것도 넣지 않았다:\n  · ` + bad.join('\n  · '));
  process.exit(1);
}
console.log(`✓ ${rows.length}개 장면 전부 turn·조각 일치`);
if (DRY) { console.log('(--dry 라 쓰지 않음)'); process.exit(0); }

let ok = 0;
for (const r of rows) {
  const { error } = await sb.from('eng_scenes').update({ grammar: r.grammar }).eq('id', r.id);
  if (error) { console.error(`  ✗ ${r.id}: ${error.message}`); continue; }
  ok++; process.stdout.write(`\r  ${ok}/${rows.length}`);
}
console.log(`\n✓ ${ok}개 저장`);
