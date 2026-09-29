#!/usr/bin/env node
/**
 * English 모드 데이터 도구 — 카드팩 업로드와 밤 보급(/eng-pack) 에이전트의 손발.
 *
 *   node upload-eng.mjs pack <cards.json>        # 카드팩 upsert (중복은 갱신)
 *   node upload-eng.mjs stats                    # 토픽×레벨 재고 (보급 판단용)
 *   node upload-eng.mjs journal-pending          # 교정 대기 일기 → JSON 출력
 *   node upload-eng.mjs journal-correct <f.json> # 교정 결과 반영
 *   node upload-eng.mjs inbox-pending            # 변환 대기 인박스 → JSON 출력
 *   node upload-eng.mjs inbox-convert <f.json>   # 인박스 → 카드 변환 반영
 *   node upload-eng.mjs briefing <brief.json> [brief.mp3]  # 브리핑 upsert (+네이티브 오디오)
 *
 * 인증: KTREE_EMAIL / KTREE_PASSWORD (upload-note.mjs 와 동일 — 환경변수 또는 ktree/.env)
 *
 * cards.json 형식:
 *   { "cards": [ { "topic": "테크", "scenario": "incident", "level": 3,
 *                  "prompt_ko": "...", "answer_en": "...", "note": "...",
 *                  "source": "pack", "source_ref": null }, ... ] }
 *
 * journal-correct 형식:
 *   [ { "entry_date": "2026-09-29",
 *       "corrected": [ { "orig": "...", "better": "...", "why": "...", "ok": false }, ... ] } ]
 *
 * inbox-convert 형식:
 *   [ { "id": "<eng_inbox.id>", "discard": false,
 *       "card": { "topic": "...", "scenario": "...", "level": 2,
 *                 "prompt_ko": "...", "answer_en": "...", "note": "...", "source_ref": "..." } } ]
 *
 * briefing.json 형식:
 *   { "brief_date": "2026-09-29", "title": "...", "script": "...", "level": 2,
 *     "expressions": ["...", "..."], "sources": [ { "title": "...", "url": "..." } ] }
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [cmd, file, extra] = process.argv.slice(2);

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function readCredentials() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    url ||= html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
    key ||= html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
  }
  if (!url || !key) die('SUPABASE_URL / SUPABASE_ANON_KEY 를 찾을 수 없습니다.');
  return { url, key };
}

function loadDotenv() {
  const out = {};
  try {
    const txt = readFileSync(new URL('./.env', import.meta.url), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (_) { /* .env 없으면 환경변수만 사용 */ }
  return out;
}

async function connect() {
  const { url, key } = readCredentials();
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const env = loadDotenv();
  const email = process.env.KTREE_EMAIL || env.KTREE_EMAIL;
  const password = process.env.KTREE_PASSWORD || env.KTREE_PASSWORD;
  if (!email || !password) die('KTREE_EMAIL / KTREE_PASSWORD 가 필요합니다.');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) die(`로그인 실패: ${error.message}`);
  return { sb, uid: data.user.id };
}

function readJson(f) {
  if (!f) die('JSON 파일 경로가 필요합니다.');
  try { return JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { die(`JSON 을 읽을 수 없습니다 (${f}): ${e.message}`); }
}

const VALID_SOURCES = ['pack', 'session', 'inbox', 'journal', 'briefing'];

function validateCard(c, i) {
  const where = `cards[${i}]`;
  if (!c.topic?.trim()) die(`${where}: topic 이 없습니다`);
  if (!c.prompt_ko?.trim()) die(`${where}: prompt_ko 가 없습니다`);
  if (!c.answer_en?.trim()) die(`${where}: answer_en 이 없습니다`);
  const lv = Number(c.level);
  if (!(lv >= 1 && lv <= 4)) die(`${where}: level 은 1~4 (지금: ${c.level})`);
  if (c.source && !VALID_SOURCES.includes(c.source)) die(`${where}: source 는 ${VALID_SOURCES.join('/')}`);
}

async function ensureTopics(sb, uid, names) {
  const { data } = await sb.from('eng_topics').select('name');
  const have = new Set((data || []).map(t => t.name));
  const missing = [...new Set(names)].filter(n => !have.has(n));
  if (!missing.length) return;
  await sb.from('eng_topics').insert(missing.map((name, i) => ({ user_id: uid, name, sort: have.size + i })));
  console.log(`  (새 토픽 등록: ${missing.join(', ')})`);
}

async function cmdPack(sb, uid) {
  const { cards } = readJson(file);
  if (!Array.isArray(cards) || !cards.length) die('cards 배열이 비어 있습니다.');
  cards.forEach(validateCard);
  await ensureTopics(sb, uid, cards.map(c => c.topic.trim()));

  const rows = cards.map(c => ({
    user_id: uid,
    topic: c.topic.trim(),
    scenario: (c.scenario || '').trim(),
    level: Number(c.level),
    prompt_ko: c.prompt_ko.trim(),
    answer_en: c.answer_en.trim(),
    note: (c.note || '').trim(),
    source: c.source || 'pack',
    source_ref: c.source_ref || null,
  }));
  // 이미 있는 카드(user_id+prompt_ko+answer_en 동일)는 내용만 갱신 — SRS 상태는 건드리지 않는다
  const { error } = await sb.from('eng_cards')
    .upsert(rows, { onConflict: 'user_id,prompt_ko,answer_en', ignoreDuplicates: false });
  if (error) die(`업로드 실패: ${error.message}\n  (english-schema.sql 을 실행했는지 확인하세요)`);
  console.log(`✓ 카드 ${rows.length}장 업로드됨`);
  await cmdStats(sb, uid);
}

async function cmdStats(sb) {
  const { data, error } = await sb.from('eng_cards').select('topic, level, status');
  if (error) die(`조회 실패: ${error.message}`);
  const key = (t, l) => `${t}|${l}`;
  const agg = new Map();
  for (const c of data || []) {
    const k = key(c.topic, c.level);
    if (!agg.has(k)) agg.set(k, { total: 0, unseen: 0, mature: 0 });
    const a = agg.get(k);
    a.total++;
    if (c.status === 'new') a.unseen++;
    if (c.status === 'mature') a.mature++;
  }
  const { data: tps } = await sb.from('eng_topics').select('name, active').order('sort');
  console.log(`\n재고 (전체 ${data?.length ?? 0}장) — unseen 이 얇은 곳이 보급 대상:`);
  for (const t of tps || []) {
    const line = [1, 2, 3, 4].map(l => {
      const a = agg.get(key(t.name, l)) || { total: 0, unseen: 0, mature: 0 };
      return `L${l} ${a.unseen}/${a.total}`;
    }).join('  ');
    console.log(`  ${t.active ? '●' : '○'} ${t.name.padEnd(6)} ${line}   (unseen/total)`);
  }
}

async function cmdJournalPending(sb) {
  const { data, error } = await sb.from('eng_journal')
    .select('entry_date, raw').eq('status', 'pending').order('entry_date');
  if (error) die(error.message);
  console.log(JSON.stringify(data || [], null, 2));
}

async function cmdJournalCorrect(sb) {
  const items = readJson(file);
  for (const it of items) {
    if (!it.entry_date || !Array.isArray(it.corrected)) die('entry_date / corrected 배열이 필요합니다.');
    const { error } = await sb.from('eng_journal')
      .update({ corrected: it.corrected, status: 'corrected' })
      .eq('entry_date', it.entry_date);
    if (error) die(`${it.entry_date} 반영 실패: ${error.message}`);
    console.log(`✓ 일기 교정 반영: ${it.entry_date} (${it.corrected.length}문장)`);
  }
}

async function cmdInboxPending(sb) {
  const { data, error } = await sb.from('eng_inbox')
    .select('id, text, source, created_at').eq('status', 'pending').order('created_at');
  if (error) die(error.message);
  console.log(JSON.stringify(data || [], null, 2));
}

async function cmdInboxConvert(sb, uid) {
  const items = readJson(file);
  for (const it of items) {
    if (!it.id) die('인박스 id 가 필요합니다.');
    if (it.discard) {
      await sb.from('eng_inbox').update({ status: 'discarded' }).eq('id', it.id);
      console.log(`- 버림: ${it.id}`);
      continue;
    }
    validateCard(it.card, 0);
    await ensureTopics(sb, uid, [it.card.topic.trim()]);
    const { data: card, error } = await sb.from('eng_cards')
      .upsert({
        user_id: uid, topic: it.card.topic.trim(), scenario: it.card.scenario || '',
        level: Number(it.card.level), prompt_ko: it.card.prompt_ko.trim(),
        answer_en: it.card.answer_en.trim(), note: it.card.note || '',
        source: 'inbox', source_ref: it.card.source_ref || null,
      }, { onConflict: 'user_id,prompt_ko,answer_en' })
      .select().single();
    if (error) die(`카드 변환 실패: ${error.message}`);
    await sb.from('eng_inbox').update({ status: 'converted', card_id: card.id }).eq('id', it.id);
    console.log(`✓ 카드됨: "${it.card.answer_en}" → ${it.card.topic}/L${it.card.level}`);
  }
}

async function cmdBriefing(sb, uid) {
  const b = readJson(file);
  if (!b.script?.trim()) die('script 가 없습니다.');
  const date = b.brief_date || new Date().toLocaleDateString('sv');

  // mp3 가 주어지면 Storage(eng-audio)에 올리고 공개 URL 을 박는다
  let audio_url = b.audio_url || null;
  if (extra) {
    const buf = readFileSync(extra);
    const path = `brief/${uid.slice(0, 8)}/${date}.mp3`;
    const { error: se } = await sb.storage.from('eng-audio')
      .upload(path, buf, { contentType: 'audio/mpeg', upsert: true });
    if (se) die(`오디오 업로드 실패: ${se.message}\n  (supabase/english-audio.sql 을 실행했는지 확인하세요)`);
    audio_url = sb.storage.from('eng-audio').getPublicUrl(path).data.publicUrl;
    console.log(`✓ 오디오 업로드됨 (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  const rec = {
    user_id: uid,
    brief_date: date,
    title: b.title || '',
    script: b.script.trim(),
    level: Number(b.level) || 2,
    expressions: b.expressions || [],
    sources: b.sources || [],
  };
  // audio_url 컬럼은 english-audio.sql 이후에만 존재 — 없으면 키 자체를 안 보낸다
  if (audio_url) rec.audio_url = audio_url;
  const { error } = await sb.from('eng_briefings').upsert(rec, { onConflict: 'user_id,brief_date' });
  if (error) die(`브리핑 업로드 실패: ${error.message}`);
  console.log(`✓ 브리핑 업로드됨: ${date} — ${b.title || '(제목 없음)'}${audio_url ? ' 🔊 네이티브 오디오' : ''}`);
}

const { sb, uid } = await connect();
try {
  if (cmd === 'pack') await cmdPack(sb, uid);
  else if (cmd === 'stats') await cmdStats(sb, uid);
  else if (cmd === 'journal-pending') await cmdJournalPending(sb);
  else if (cmd === 'journal-correct') await cmdJournalCorrect(sb);
  else if (cmd === 'inbox-pending') await cmdInboxPending(sb);
  else if (cmd === 'inbox-convert') await cmdInboxConvert(sb, uid);
  else if (cmd === 'briefing') await cmdBriefing(sb, uid);
  else die('사용법: node upload-eng.mjs <pack|stats|journal-pending|journal-correct|inbox-pending|inbox-convert|briefing> [file.json]');
} finally {
  await sb.auth.signOut();
}
