#!/usr/bin/env node
/**
 * 카드 문장(answer_en) → 네이티브 mp3 일괄 생성 (MS Edge 뉴럴 TTS, 무료)
 * Storage 의 eng-audio/cards/t/<글자키>.mp3 (한국어는 cards/k/) 로 올린다 — 앱은 이 경로를 먼저 시도하고
 * 없으면 기기 TTS 로 폴백하므로, 새 카드가 생기면 이 스크립트만 다시 돌리면 된다.
 *
 *   node tts-cards.mjs            # 오디오 없는 카드만 생성
 *   node tts-cards.mjs --all      # 전부 재생성 (음성 바꿀 때)
 *   node tts-cards.mjs --voice en-US-AvaMultilingualNeural
 *   node tts-cards.mjs --since 2026-10-24T15:00:00Z   # 그 뒤에 구운 것만 다시 (음성이 깨졌던 구간)
 *
 * 인증: KTREE_EMAIL / KTREE_PASSWORD (다른 도구와 동일)
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { synth as say, synthBatch } from './edge-say.mjs';

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const VOICE = argv.includes('--voice') ? argv[argv.indexOf('--voice') + 1] : 'en-US-AndrewMultilingualNeural';
// 한국어 뜻도 굽는다 (cards/<id>.ko.mp3).
// 왜: 어휘 훑기의 "해석 같이 듣기"가 기기 TTS 로 한국어를 읽으면 음질이 튀고,
// 무엇보다 **통짜로 이어 붙일 수 없어 백그라운드에서 끊긴다.**
// 같은 포맷(24kHz 모노 MP3)으로 구워두면 영어와 함께 한 트랙으로 묶인다.
const KO_VOICE = 'ko-KR-SunHiNeural';
const KO = !argv.includes('--no-ko');
const SINCE = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : null;
const stale = o => SINCE && (o.updated_at || o.created_at) >= SINCE;   // 있어도 없는 셈 친다

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

// 🔴 카드 id 로 경로를 잡으면 **앱이 카드를 만든 뒤에야** 음성을 구울 수 있다.
// 카드는 사람마다 공부하는 순간 앱이 만드는데 음성은 그 전날 밤에 굽기 때문에,
// 오늘 새로 나온 어휘는 매일 기기 TTS 로 떨어졌다 (실측: 하루 25장 전부).
// 그래서 **글자로 경로를 잡는다** — 장면·기사가 만들어진 직후에 구울 수 있고,
// 같은 표현은 사람이 몇이든 파일 하나를 같이 쓴다.
// audioKey 는 앱 파일에서 그대로 읽어온다. 베껴 두면 언젠가 어긋나고,
// 어긋나면 조용히 전부 로봇 음성으로 떨어진다.
const appHtml = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const audioKey = new Function(
  appHtml.slice(appHtml.indexOf('function audioKey(s){'), appHtml.indexOf('const CARD_AUD =')) +
  '; return audioKey;')();

// 모범답안을 **문장 단위로** 굽는다 — Speaking 2걸음(따라 말하기)이 한 줄씩 들려준다.
// 쪼개는 규칙도 앱에서 읽어온다. 베껴 두면 어긋나고, 어긋나면 조용히 로봇 음성이 된다.
const sentences = new Function(
  appHtml.slice(appHtml.indexOf('const sentences = t =>'),
                appHtml.indexOf('\n', appHtml.indexOf('const sentences = t =>'))) +
  '; return sentences;')();

const [sc, ar, cd, pr] = await Promise.all([
  sb.from('eng_scenes').select('vocab').limit(2000),
  sb.from('eng_articles').select('vocab').limit(2000),
  sb.from('eng_cards').select('answer_en, prompt_ko').limit(5000),
  sb.from('eng_prompts').select('id, question_en, model_en, model_l1'),
]);
for (const r of [sc, ar, cd, pr]) if (r.error) die(r.error.message);

// 영어는 term, 한국어는 뜻. 같은 글자는 한 번만 굽는다.
const en = new Map(), ko = new Map();
const addEn = t => { const x = String(t || '').trim(); if (x) en.set(audioKey(x), x); };
const addKo = t => { const x = String(t || '').trim(); if (x) ko.set(audioKey(x), x); };
for (const row of [...(sc.data || []), ...(ar.data || [])])
  for (const v of (row.vocab || [])) {
    addEn(v.term);
    addKo(v.kind === 'word' ? v.meaning_ko : (v.meaning_ko || v.prompt_ko));
  }
for (const c of (cd.data || [])) { addEn(c.answer_en); addKo(c.prompt_ko); }
for (const x of (pr.data || [])) for (const sn of [...sentences(x.model_en), ...sentences(x.model_l1)]) addEn(sn);

// 문법 예문 — 판의 Grammar 칸이 사람 목소리로 들려준다. 목록은 앱에 있으니 앱에서 읽는다.
const GRAMMAR = new Function(
  appHtml.slice(appHtml.indexOf('const GRAMMAR = ['), appHtml.indexOf('/* GRAMMAR 끝')) +
  '; return GRAMMAR;')();
for (const g of GRAMMAR) for (const [e, k] of g.ex) { addEn(e); addKo(k); }
// 알아듣기 문법 예문 — 장면 대사 칩·문법 사전에서 ▶ 로 들려준다
const READ = new Function(
  appHtml.slice(appHtml.indexOf('const READ = ['), appHtml.indexOf('/* READ 끝')) + '; return READ;')();
for (const g of READ) for (const [e, k] of g.ex) { addEn(e); addKo(k); }

// 이미 구운 것 확인 (Storage list 는 1000개 단위 페이지)
async function listed(dir){
  const have = new Set();
  for (let page = 0; ; page++) {
    const { data: objs } = await sb.storage.from('eng-audio')
      .list(dir, { limit: 1000, offset: page * 1000 });
    (objs || []).filter(o => !stale(o)).forEach(o => have.add(o.name.replace(/\.mp3$/, '')));
    if (!objs || objs.length < 1000) break;
  }
  return have;
}
const [haveEn, haveKo] = ALL ? [new Set(), new Set()]
                             : await Promise.all([listed('cards/t'), listed('cards/k')]);

const todo   = [...en].filter(([k]) => !haveEn.has(k)).map(([k, text]) => ({ k, text }));
const koTodo = KO ? [...ko].filter(([k]) => !haveKo.has(k)).map(([k, text]) => ({ k, text })) : [];
console.log(`· 어휘 영어 ${en.size}종 · 한국어 ${ko.size}종 (장면·기사·카드 전체)`);
// 카드가 최신이어도 **끝내지 않는다** — 아래 질문 음성까지 가야 한다 (여기서 끊겨 질문이 0개였다)
if (!todo.length && !koTodo.length) console.log('· 카드는 전부 최신');
console.log(`영어 ${todo.length}장 · 한국어 ${koTodo.length}장 생성...`);

// 카드는 한 묶음으로 미리 굽는다 — 한 장씩 프로세스를 띄우면 수백 장이 몇 분 더 걸린다
const pre = new Map();
for (const [list, v] of [[todo, VOICE], [koTodo, KO_VOICE]]) {
  const r = await synthBatch(list.map(c => ({ text: c.text, voice: v })));
  list.forEach((c, i) => pre.set(v + '|' + c.text, r[i]));
}
async function synthVoice(v, text) {
  const r = pre.get(v + '|' + text);
  if (!r) return (await say(text, v)).buf;   // 묶음 밖(질문·모범답 등)은 그때 굽는다
  if (!r.buf) throw new Error(r.err || 'TTS 실패');
  return r.buf;
}
const synth = text => synthVoice(VOICE, text);

let ok = 0, fail = 0;
for (const c of todo) {
  try {
    const buf = await synth(c.text);
    if (buf.length < 500) throw new Error('오디오가 비정상적으로 작음');
    const { error: se } = await sb.storage.from('eng-audio')
      .upload(`cards/t/${c.k}.mp3`, buf, { contentType: 'audio/mpeg', upsert: true });
    if (se) throw se;
    ok++;
    process.stdout.write(`\r  ${ok}/${todo.length}`);
    await new Promise(r => setTimeout(r, 150));   // 서비스에 예의
  } catch (e) {
    fail++;
    console.error(`\n  ✗ "${c.text.slice(0, 40)}...": ${e.message}`);
  }
}
console.log(`\n✓ 영어 ${ok}장 생성${fail ? `, ${fail}장 실패 (기기 TTS 폴백으로 동작)` : ''}`);

let kok = 0, kofail = 0;
for (const c of koTodo) {
  try {
    const buf = await synthVoice(KO_VOICE, c.text);
    if (buf.length < 500) throw new Error('오디오가 비정상적으로 작음');
    const { error: se } = await sb.storage.from('eng-audio')
      .upload(`cards/k/${c.k}.mp3`, buf, { contentType: 'audio/mpeg', upsert: true });
    if (se) throw se;
    kok++;
    process.stdout.write(`\r  한국어 ${kok}/${koTodo.length}`);
    await new Promise(r => setTimeout(r, 150));
  } catch (e) {
    kofail++;
    console.error(`\n  ✗ ko "${String(c.text).slice(0, 30)}...": ${e.message}`);
  }
}
if (koTodo.length) console.log(`\n✓ 한국어 ${kok}장 생성${kofail ? `, ${kofail}장 실패` : ''}`);

// ── 오픽 질문 음성 ──────────────────────────────────────
// 실제 시험은 질문이 **귀로만** 온다. 앱이 질문을 텍스트로 띄워와서
// "질문을 못 알아듣는" 상태가 그대로 남았다. 경로는 카드와 같은 규칙이라 DB 컬럼이 필요 없다.
const prompts = pr.data || [];
const phave = new Set();
for (let page = 0; ; page++) {
  const { data: objs } = await sb.storage.from('eng-audio').list('prompts', { limit: 1000, offset: page * 1000 });
  (objs || []).filter(o => !stale(o)).forEach(o => phave.add(o.name.replace(/\.mp3$/, '')));
  if (!objs || objs.length < 1000) break;
}
const pTodo = (prompts || []).filter(x => ALL || !phave.has(x.id));
if (pTodo.length) {
  console.log(`질문 ${pTodo.length}개 생성...`);
  let pok = 0;
  for (const x of pTodo) {
    try {
      const buf = await synth(x.question_en);
      if (buf.length < 500) throw new Error('오디오가 비정상적으로 작음');
      const { error: se } = await sb.storage.from('eng-audio')
        .upload(`prompts/${x.id}.mp3`, buf, { contentType: 'audio/mpeg', upsert: true });
      if (se) throw se;
      pok++; process.stdout.write(`\r  질문 ${pok}/${pTodo.length}`);
      await new Promise(r => setTimeout(r, 150));
    } catch (e) { console.error(`\n  ✗ "${x.question_en.slice(0,40)}": ${e.message}`); }
  }
  console.log(`\n✓ 질문 ${pok}개 생성`);
}

await sb.auth.signOut({ scope: 'local' });
