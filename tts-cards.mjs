#!/usr/bin/env node
/**
 * 카드 문장(answer_en) → 네이티브 mp3 일괄 생성 (MS Edge 뉴럴 TTS, 무료)
 * Storage 의 eng-audio/cards/<card_id>.mp3 로 올린다 — 앱은 이 경로를 먼저 시도하고
 * 없으면 기기 TTS 로 폴백하므로, 새 카드가 생기면 이 스크립트만 다시 돌리면 된다.
 *
 *   node tts-cards.mjs            # 오디오 없는 카드만 생성
 *   node tts-cards.mjs --all      # 전부 재생성 (음성 바꿀 때)
 *   node tts-cards.mjs --voice en-US-AvaMultilingualNeural
 *
 * 인증: KTREE_EMAIL / KTREE_PASSWORD (다른 도구와 동일)
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const VOICE = argv.includes('--voice') ? argv[argv.indexOf('--voice') + 1] : 'en-US-AndrewMultilingualNeural';
// 한국어 뜻도 굽는다 (cards/<id>.ko.mp3).
// 왜: 어휘 훑기의 "해석 같이 듣기"가 기기 TTS 로 한국어를 읽으면 음질이 튀고,
// 무엇보다 **통짜로 이어 붙일 수 없어 백그라운드에서 끊긴다.**
// 같은 포맷(24kHz 모노 MP3)으로 구워두면 영어와 함께 한 트랙으로 묶인다.
const KO_VOICE = 'ko-KR-SunHiNeural';
const KO = !argv.includes('--no-ko');

function die(m) { console.error(`✗ ${m}`); process.exit(1); }

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const URL_ = process.env.SUPABASE_URL || html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
const KEY = process.env.SUPABASE_ANON_KEY || html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];

let env = {};
try {
  env = Object.fromEntries(readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => l.replace(/^export /, '').split('=').map(s => s.trim().replace(/^['"]|['"]$/g, ''))));
} catch (_) { /* .env 없으면 환경변수만 */ }

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const { error: ae } = await sb.auth.signInWithPassword({
  email: process.env.KTREE_EMAIL || env.KTREE_EMAIL,
  password: process.env.KTREE_PASSWORD || env.KTREE_PASSWORD,
});
if (ae) die(`로그인 실패: ${ae.message}`);

const { data: cards, error } = await sb.from('eng_cards').select('id, answer_en, prompt_ko').limit(5000);
if (error) die(error.message);

// 이미 구운 것 확인 (Storage list 는 1000개 단위 페이지)
const have = new Set();
if (!ALL) {
  for (let page = 0; ; page++) {
    const { data: objs } = await sb.storage.from('eng-audio')
      .list('cards', { limit: 1000, offset: page * 1000 });
    (objs || []).forEach(o => have.add(o.name.replace(/\.mp3$/, '')));
    if (!objs || objs.length < 1000) break;
  }
}

const todo = cards.filter(c => !have.has(c.id));
const koTodo = KO ? cards.filter(c => c.prompt_ko && !have.has(c.id + '.ko')) : [];
if (!todo.length && !koTodo.length) { console.log('✓ 전부 최신 — 생성할 카드 없음'); await sb.auth.signOut(); process.exit(0); }
console.log(`영어 ${todo.length}장 · 한국어 ${koTodo.length}장 생성...`);

const tts = new MsEdgeTTS();
await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
const ktts = new MsEdgeTTS();
if (koTodo.length) await ktts.setMetadata(KO_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

async function synthWith(engine, text) {
  const { audioStream } = await engine.toStream(text);
  return new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on('data', c => chunks.push(c));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

async function synth(text) {
  const { audioStream } = await tts.toStream(text);
  return new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on('data', c => chunks.push(c));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

let ok = 0, fail = 0;
for (const c of todo) {
  try {
    const buf = await synth(c.answer_en);
    if (buf.length < 500) throw new Error('오디오가 비정상적으로 작음');
    const { error: se } = await sb.storage.from('eng-audio')
      .upload(`cards/${c.id}.mp3`, buf, { contentType: 'audio/mpeg', upsert: true });
    if (se) throw se;
    ok++;
    process.stdout.write(`\r  ${ok}/${todo.length}`);
    await new Promise(r => setTimeout(r, 150));   // 서비스에 예의
  } catch (e) {
    fail++;
    console.error(`\n  ✗ "${c.answer_en.slice(0, 40)}...": ${e.message}`);
  }
}
console.log(`\n✓ 영어 ${ok}장 생성${fail ? `, ${fail}장 실패 (기기 TTS 폴백으로 동작)` : ''}`);

let kok = 0, kofail = 0;
for (const c of koTodo) {
  try {
    const buf = await synthWith(ktts, c.prompt_ko);
    if (buf.length < 500) throw new Error('오디오가 비정상적으로 작음');
    const { error: se } = await sb.storage.from('eng-audio')
      .upload(`cards/${c.id}.ko.mp3`, buf, { contentType: 'audio/mpeg', upsert: true });
    if (se) throw se;
    kok++;
    process.stdout.write(`\r  한국어 ${kok}/${koTodo.length}`);
    await new Promise(r => setTimeout(r, 150));
  } catch (e) {
    kofail++;
    console.error(`\n  ✗ ko "${String(c.prompt_ko).slice(0, 30)}...": ${e.message}`);
  }
}
if (koTodo.length) console.log(`\n✓ 한국어 ${kok}장 생성${kofail ? `, ${kofail}장 실패` : ''}`);
await sb.auth.signOut();
