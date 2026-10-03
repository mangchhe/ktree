#!/usr/bin/env node
/**
 * 기존 장면에 통짜 오디오를 메운다 (백그라운드 재생용).
 *
 *   node backfill-scene-full.mjs [--dry] [--all]
 *
 * 이미 올라간 턴별 mp3 를 **내려받아 이어 붙인다** — TTS 를 다시 돌리지 않는다.
 * 같은 포맷(24kHz 모노 MP3)이라 바이트 연결로 재생된다.
 *
 * 턴별 파일은 지우지 않는다. 역할 채우기는 내 턴에서 멈춰야 하므로 계속 필요하다.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ALL = argv.includes('--all');

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
                        html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1],
                        { auth:{ persistSession:false } });
const { data: auth, error: e0 } = await sb.auth.signInWithPassword({
  email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
if (e0) { console.error('✗ 로그인 실패:', e0.message); process.exit(1); }

let q = sb.from('eng_scenes').select('id, scene_id, situation_ko, turns, full_url, user_id');
if (!ALL) q = q.is('full_url', null);
const { data: scenes, error } = await q.order('created_at');
if (error) { console.error('✗', error.message); process.exit(1); }
if (!scenes.length) { console.log('메울 장면이 없습니다.'); process.exit(0); }
console.log(`대상 ${scenes.length}개${ALL ? ' (--all)' : ''}\n`);

for (const s of scenes) {
  const turns = s.turns || [];
  const urls = turns.map(t => t.audio_url).filter(Boolean);
  if (urls.length !== turns.length || !urls.length) {
    console.log(`· ${s.scene_id} — 턴 오디오가 ${urls.length}/${turns.length} 뿐, 건너뜀`);
    continue;
  }
  if (s.user_id !== auth.user.id) {   // RLS: 남의 장면은 수정 못 한다
    console.log(`· ${s.scene_id} — 내가 만든 것이 아님, 건너뜀`);
    continue;
  }
  const bufs = [], starts = [];
  let at = 0, fail = false;
  for (let i = 0; i < urls.length; i++) {
    const r = await fetch(urls[i]);
    if (!r.ok) { console.log(`✗ ${s.scene_id} — 턴 ${i} 내려받기 실패 (${r.status})`); fail = true; break; }
    bufs.push(Buffer.from(await r.arrayBuffer()));
    starts.push(Math.round(at));
    at += turns[i].ms || 0;
  }
  if (fail) continue;
  const full = Buffer.concat(bufs);
  if (DRY) { console.log(`(dry) ${s.scene_id} — ${urls.length}턴 · ${(full.length/1024).toFixed(0)}KB · ${(at/1000).toFixed(1)}초`); continue; }

  const path = `scenes/${s.scene_id}/full.mp3`;
  const up = await sb.storage.from('eng-audio').upload(path, full, { contentType:'audio/mpeg', upsert:true });
  if (up.error) { console.log(`✗ ${s.scene_id} — 업로드 실패: ${up.error.message}`); continue; }
  const { data: pub } = sb.storage.from('eng-audio').getPublicUrl(path);
  const { error: e2 } = await sb.from('eng_scenes')
    .update({ full_url: pub.publicUrl, full_starts: starts }).eq('id', s.id);
  console.log(e2 ? `✗ ${s.scene_id} — ${e2.message}`
                 : `✓ ${s.scene_id} — ${urls.length}턴 · ${(full.length/1024).toFixed(0)}KB · ${(at/1000).toFixed(1)}초`);
}
await sb.auth.signOut();
