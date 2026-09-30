#!/usr/bin/env node
/**
 * 장면·기사 오디오 + **단어/문장 타이밍** 생성 (MS Edge 뉴럴 TTS, 무료).
 *
 * 왜 타이밍인가: 읽는 자리를 문장 박스로 밝히고 단어를 따라가게 하려면 재생 시점이 필요하다.
 * msedge-tts 가 wordBoundary/sentenceBoundary 메타를 주므로 **생성 시점에 박아두면**
 * 앱은 audio.currentTime 으로 인덱스만 찾으면 된다 (런타임 계산 없음).
 *
 * 왜 대화는 턴별로 쪼개는가: 역할 채우기가 **내 턴에서 멈춰야** 한다. 어차피 쪼개져 있어야 하므로
 * 이어붙이지 않는다 — ffmpeg 의존도 사라진다.
 *
 *   node eng-gen.mjs drafts/english/scene-<날짜>-<id>.json      장면
 *   node eng-gen.mjs drafts/english/article-<날짜>.json         기사
 *   node eng-gen.mjs <파일> --dry                               업로드 없이 생성·검증만
 *   node eng-gen.mjs <파일> --save <dir>                        mp3 를 로컬에도 떨어뜨린다 (미리보기·검수용)
 *   node eng-gen.mjs --recent [N]                               최근 장면·기사 목록 (밤 보급이 중복을 피하려고 본다)
 *
 * 입력(장면):  { "id","situation_ko","voices":{"a","b"},"turns":[{"who","en","intent_ko","is_me"}],
 *                "vocab":[{"kind","term","meaning_ko","prompt_ko","example"}] }
 *
 *   kind="phrase" (기본) — 목적은 **뱉기**. prompt_ko(그 표현이 나올 수밖에 없는 상황)가
 *     **반드시** 있어야 한다. 없으면 산출 복습을 만들 수 없어 올리지 않는다.
 *   kind="word" — 목적은 **뜻 알기**. prompt_ko 대신 meaning_ko 를 쓴다(뜻이 곧 정답).
 *     example(그 단어가 쓰인 문장)을 note 에 붙여 맥락을 남긴다.
 * 입력(기사):  { "id","title","sentences":[...],"voice" }
 * 출력: 같은 파일에 audio/timings 를 채워 넣고, Storage 에 mp3 를 올린다.
 *
 * 인증: KTREE_EMAIL / KTREE_PASSWORD (다른 도구와 동일)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const argv = process.argv.slice(2);
const RECENT = argv.includes('--recent');
const FILE = argv.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
const DRY = argv.includes('--dry');
const SAVE = argv.includes('--save') ? argv[argv.indexOf('--save') + 1] : null;
if (SAVE) mkdirSync(SAVE, { recursive: true });
if (!FILE && !RECENT) die('사용법: node eng-gen.mjs <장면|기사 json> [--dry] | --recent [N]');

/** 96kbps CBR 이라 바이트로 길이를 정확히 낸다 (ffprobe 없이) */
const FMT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;
const BITRATE = 96000;
const msOf = buf => Math.round(buf.length * 8 / BITRATE * 1000);

function die(m) { console.error(`✗ ${m}`); process.exit(1); }

/* ── TTS ────────────────────────────────────────────────── */

const engines = new Map();
async function engine(voice) {
  if (engines.has(voice)) return engines.get(voice);
  const t = new MsEdgeTTS();
  await t.setMetadata(voice, FMT, { wordBoundaryEnabled: true, sentenceBoundaryEnabled: true });
  engines.set(voice, t);
  return t;
}

/** 붙어서 오는 pretty-JSON 객체들을 괄호 균형으로 쪼갠다 (JSONL 이 아니다) */
function parseMeta(raw) {
  const out = [];
  let depth = 0, start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (raw[i] === '}') { depth--; if (depth === 0 && start >= 0) { out.push(raw.slice(start, i + 1)); start = -1; } }
  }
  const items = [];
  for (const o of out) { try { for (const m of (JSON.parse(o).Metadata || [])) items.push(m); } catch { /* 조각난 객체는 버린다 */ } }
  return items;
}

const tick2ms = t => Math.round((t || 0) / 10000);   // 100ns 틱 → ms

async function synth(text, voice) {
  const tts = await engine(voice);
  const { audioStream, metadataStream } = tts.toStream(text);
  const chunks = [];
  let raw = '';
  audioStream.on('data', c => chunks.push(c));
  metadataStream?.on('data', c => raw += c.toString());
  await new Promise((res, rej) => { audioStream.on('end', res); audioStream.on('error', rej); });
  await new Promise(r => setTimeout(r, 250));        // 메타가 오디오보다 늦게 닫힌다

  const buf = Buffer.concat(chunks);
  if (buf.length < 500) throw new Error('오디오가 비정상적으로 작다');

  const items = parseMeta(raw);
  const words = items.filter(m => m.Type === 'WordBoundary').map(m => ({
    t: tick2ms(m.Data.Offset), d: tick2ms(m.Data.Duration), w: m.Data.text?.Text ?? '',
  }));
  const sents = items.filter(m => m.Type === 'SentenceBoundary').map(m => ({
    t: tick2ms(m.Data.Offset), s: m.Data.text?.Text ?? '',
  }));
  return { buf, words, sents, ms: msOf(buf) };
}

/* ── 정렬: 이벤트를 원문의 **문자 범위**에 붙인다 ──────────────
 *
 * 토큰 인덱스로 맞추면 반드시 밀린다 (실측):
 *   · 'Kafka 4.x'    → '4' '.' 'x'  세 이벤트      토큰 1 : 이벤트 N
 *   · 'version 1.36' → 이벤트 하나로 묶여 온다      토큰 N : 이벤트 1
 *   · '1.36'         → 'one point thirty six' 로 읽어 글자가 아예 안 맞는 경우도 있다
 * 양방향 다대다라서, 원문에서 순서대로 찾는 방식만 버틴다.
 * 결과는 segs = [[텍스트, 이벤트번호|null], …] 로 저장해 앱이 계산 없이 밝히게 한다. */

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function alignRanges(text, timed) {
  const low = text.toLowerCase();
  const out = [];
  let pos = 0;
  for (const w of timed) {
    const t = (w.w || '').trim();
    let a = pos, b = pos;
    if (t) {
      const i = low.indexOf(t.toLowerCase(), pos);
      if (i >= 0) { a = i; b = i + t.length; }
      else {
        // 공백·문장부호 차이를 허용 ('version 1.36' 같은 묶음)
        const re = new RegExp(esc(t.toLowerCase()).replace(/\\ /g, '[^a-z0-9]{0,3}'));
        const m = re.exec(low.slice(pos));
        if (m) { a = pos + m.index; b = a + m[0].length; }
      }
    }
    out.push({ t: w.t, d: w.d, a, b });
    if (b > pos) pos = b;
  }
  return out;
}

/** 원문을 이벤트 경계로 잘라 [텍스트, 이벤트번호|null] 로 */
function toSegs(text, marked) {
  const marks = marked
    .filter(([, r]) => r.b > r.a && r.a >= 0 && r.a < text.length)
    .map(([n, r]) => [r.a, Math.min(r.b, text.length), n])
    .sort((x, y) => x[0] - y[0]);
  const segs = [];
  let cur = 0;
  for (const [a, b, n] of marks) {
    if (a < cur) continue;                 // 겹치면 앞선 것을 살린다
    if (a > cur) segs.push([text.slice(cur, a), null]);
    segs.push([text.slice(a, b), n]);
    cur = b;
  }
  if (cur < text.length) segs.push([text.slice(cur), null]);
  return segs;
}

/** 정렬 품질 — 글자를 몇 % 덮었나. 이게 하이라이트 정확도다 */
function alignScore(text, ranges) {
  const letters = (text.match(/[A-Za-z0-9]/g) || []).length;
  let hit = 0;
  for (const r of ranges) hit += (text.slice(r.a, r.b).match(/[A-Za-z0-9]/g) || []).length;
  const placed = ranges.filter(r => r.b > r.a).length;
  const mono = ranges.every((r, i) => i === 0 || r.a >= ranges[i - 1].a);
  return { pct: letters ? hit / letters * 100 : 0, placed, total: ranges.length, mono };
}

/* ── 검증: 타이밍이 오디오와 어긋나지 않는가 ───────────────── */

function audit(label, text, r) {
  const issues = [];
  const tokens = text.split(/\s+/).filter(Boolean).length;

  if (!r.words.length) issues.push('단어 경계가 0개');
  // 토큰 수와 경계 수가 크게 벌어지면 하이라이트가 밀린다 (약어·숫자에서 갈릴 수 있어 여유를 둔다)
  if (r.words.length && Math.abs(r.words.length - tokens) > Math.max(2, tokens * 0.25))
    issues.push(`경계 ${r.words.length} vs 토큰 ${tokens}`);

  for (let i = 1; i < r.words.length; i++)
    if (r.words[i].t < r.words[i - 1].t) { issues.push(`offset 역주행 @${i}`); break; }

  const lastEnd = r.words.length ? r.words.at(-1).t + r.words.at(-1).d : 0;
  const tail = r.ms - lastEnd;                      // 끝 여백. 음수면 타이밍이 오디오를 넘어선 것
  if (tail < -150) issues.push(`타이밍이 오디오보다 ${-tail}ms 길다`);
  if (tail > 2500) issues.push(`끝 여백 ${tail}ms — 과도`);

  const pct = r.ms ? (lastEnd / r.ms * 100) : 0;
  console.log(`  ${issues.length ? '✗' : '✓'} ${label.padEnd(26)} ${String(r.ms).padStart(6)}ms · ` +
              `단어 ${String(r.words.length).padStart(3)} · 문장 ${r.sents.length} · ` +
              `마지막단어끝 ${pct.toFixed(1)}% · 여백 ${tail}ms`);
  issues.forEach(i => console.log(`      ↳ ${i}`));
  return issues.length === 0;
}

/* ── 업로드 ─────────────────────────────────────────────── */

let sb = null, uid = null;
async function connect() {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const url = process.env.SUPABASE_URL || html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
  const key = process.env.SUPABASE_ANON_KEY || html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
  let env = {};
  try {
    env = Object.fromEntries(readFileSync(new URL('./.env', import.meta.url), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => l.replace(/^export /, '').split('=').map(s => s.trim().replace(/^['"]|['"]$/g, ''))));
  } catch { /* .env 없으면 환경변수만 */ }
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({
    email: process.env.KTREE_EMAIL || env.KTREE_EMAIL,
    password: process.env.KTREE_PASSWORD || env.KTREE_PASSWORD,
  });
  if (error) die(`로그인 실패: ${error.message}`);
  uid = data?.user?.id;
  if (!uid) die('user id 를 못 받았다');
  return c;
}

/** 장면·기사 행을 올린다. 같은 id 로 다시 돌리면 갱신(upsert) — 음성 교체나 재생성이 안전해야 한다. */
async function pushRow(table, conflict, row) {
  const { error } = await sb.from(table).upsert({ user_id: uid, ...row }, { onConflict: conflict });
  if (error) {
    if (/vocab/i.test(error.message))
      die(`${table} 저장 실패 (${error.message}) — supabase/english-v4-shared.sql 을 먼저 실행해라`);
    // PostgREST 는 없는 테이블을 'schema cache' 로 말한다 (relation does not exist 가 아니다)
    if (/schema cache|does not exist|relation .* does not exist/i.test(error.message))
      die(`${table} 테이블이 없다 — supabase/english-v2-schema.sql 을 먼저 실행해라`);
    die(`${table} 저장 실패: ${error.message}`);
  }
}

async function put(path, buf) {
  const { error } = await sb.storage.from('eng-audio')
    .upload(path, buf, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from('eng-audio').getPublicUrl(path);
  return data.publicUrl;
}

/** 어휘를 **행에 실어둔다.** eng_cards 에 직접 넣지 않는다.
 *
 * SRS 상태(다음 복습일·간격·연속)는 사람마다 달라야 해서 카드 행을 공유할 수 없다.
 * 그래서 장면·기사에 vocab 을 얹어두고, 앱이 처음 만났을 때 **자기 계정으로** 카드를 만들어낸다.
 * 생성기가 한 계정으로 넣어버리면 같이 쓰는 사람에게는 어휘가 영영 안 생긴다.
 *
 * 층마다 필요한 것이 다르다 — 단어는 뜻(meaning_ko), 표현은 상황(prompt_ko).
 * 없으면 싣지 않는다: 상황 없는 표현으로는 산출 복습을 만들 수 없다. */
function vocabRows(doc) {
  const items = doc.vocab || [];
  const ok = v => v.term && (v.kind === 'word' ? v.meaning_ko : v.prompt_ko);
  const keep = items.filter(ok).map(v => ({
    kind: v.kind === 'word' ? 'word' : 'phrase',
    term: v.term,
    meaning_ko: v.meaning_ko || '',
    prompt_ko: v.prompt_ko || '',
    example: v.example || '',
    level: v.level || doc.level || 2,
  }));
  const dropped = items.length - keep.length;
  const nw = keep.filter(v => v.kind === 'word').length;
  console.log(`  ${dropped ? '⚠' : '✓'} 어휘 ${keep.length}개 실음 (단어 ${nw} · 표현 ${keep.length - nw})` +
    (dropped ? ` · ${dropped}개 제외 (단어는 meaning_ko, 표현은 prompt_ko 가 필요하다)` : '') +
    ' — 카드는 앱이 사람마다 만들어낸다');
  return keep;
}

/* 최근에 뭘 만들었나. 무인 보급이 같은 상황·같은 기사를 또 만들지 않으려면 이게 필요하다. */
async function showRecent(n) {
  sb = await connect();
  const { data: sc } = await sb.from('eng_scenes')
    .select('scene_id, situation_ko, topic, level, created_at')
    .order('created_at', { ascending: false }).limit(n);
  const { data: ar } = await sb.from('eng_articles')
    .select('article_id, title, topic, created_at')
    .order('created_at', { ascending: false }).limit(n);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const mine = (rows, k) => (rows || []).filter(r => (r.created_at || '').slice(0, 10) === today).length;
  console.log(`오늘(${today}) 장면 ${mine(sc)}개 · 기사 ${mine(ar)}개`);
  console.log('── 최근 장면 ──');
  for (const r of sc || [])
    console.log(`  ${(r.created_at||'').slice(0,10)}  ${r.topic} L${r.level}  ${r.scene_id}  ${(r.situation_ko||'').slice(0,42)}`);
  console.log('── 최근 기사 ──');
  for (const r of ar || [])
    console.log(`  ${(r.created_at||'').slice(0,10)}  ${r.topic}  ${(r.title||'').slice(0,54)}`);
  await sb.auth.signOut();
}

if (RECENT) {
  const n = Number(argv.find(a => /^\d+$/.test(a))) || 12;
  await showRecent(n);
  process.exit(0);
}

/* ── 본체 ───────────────────────────────────────────────── */

const doc = JSON.parse(readFileSync(FILE, 'utf8'));
const kind = doc.turns ? 'scene' : doc.sentences ? 'article' : die('turns 도 sentences 도 없다');
if (!doc.id) die('id 가 없다');
if (!DRY) sb = await connect();

console.log(`${kind === 'scene' ? '장면' : '기사'} "${doc.id}" 생성${DRY ? ' (dry — 업로드 안 함)' : ''}`);
let allOk = true, totalMs = 0, totalBytes = 0;

if (kind === 'scene') {
  const va = doc.voices?.a || 'en-US-AndrewMultilingualNeural';
  const vb = doc.voices?.b || 'en-US-AvaMultilingualNeural';
  for (let i = 0; i < doc.turns.length; i++) {
    const t = doc.turns[i];
    // **내 턴도 굽는다.** 두 군데서 쓰인다 —
    //  ① 셰도잉 패스: 대화 전체를 한 번 들려줄 때 (내 대사도 흘러야 대화가 된다)
    //  ② 역할 채우기: 내가 말한 뒤 **모범 대사를 들려줄 때**
    // 역할 채우기 중에는 앱이 이 오디오를 안 틀면 된다 (파일이 없을 필요는 없다).
    const voice = t.who === 'b' ? vb : va;
    const r = await synth(t.en, voice);
    allOk = audit(`${i} ${t.who}${t.is_me ? ' (모범)' : ''}`, t.en, r) && allOk;
    const rg = alignRanges(t.en, r.words);
    const sc = alignScore(t.en, rg);
    if (sc.pct < 97 || !sc.mono) { console.log(`      ↳ 정렬 ${sc.pct.toFixed(1)}% · 순서 ${sc.mono ? '정상' : '역주행'}`); allOk = false; }
    t.ms = r.ms; t.voice = voice;
    t.segs = toSegs(t.en, rg.map((x, n) => [n, x]));
    t.ev = rg.map(x => ({ t: x.t, d: x.d }));
    delete t.words;                       // segs/ev 가 대체한다 — 남기면 파일만 커지고 헷갈린다
    totalMs += r.ms; totalBytes += r.buf.length;
    if (SAVE) writeFileSync(`${SAVE}/scene-${doc.id}-${i}.mp3`, r.buf);
    if (!DRY) t.audio_url = await put(`scenes/${doc.id}/${i}.mp3`, r.buf);
    await new Promise(r2 => setTimeout(r2, 150));
  }
} else {
  const voice = doc.voice || 'en-US-AndrewMultilingualNeural';
  // 기사는 **한 덩어리로** 굽는다 — 문장마다 쪼개면 사이가 뚝뚝 끊겨 읽어주는 느낌이 안 난다.
  // 문장 경계는 메타가 주므로 박스 하이라이트·문장 탭 재생은 그대로 된다.
  const text = doc.sentences.join(' ');
  const r = await synth(text, voice);
  allOk = audit('기사 전체', text, r) && allOk;
  doc.ms = r.ms; doc.voice = voice;
  totalMs = r.ms; totalBytes = r.buf.length;

  // 문장별 segs 와 시작 시각을 **문자 범위 정렬**로 낸다.
  // (문장 경계 메타로 단어를 배정하면 TTS 의 문장 구분과 우리 배열이 갈려 밀린다 — 실측 확인)
  const rg = alignRanges(text, r.words);
  const sc = alignScore(text, rg);
  console.log(`  ${sc.pct >= 97 && sc.mono ? '✓' : '✗'} 정렬 ${sc.pct.toFixed(1)}% · 배치 ${sc.placed}/${sc.total} · 순서 ${sc.mono ? '정상' : '역주행'}`);
  if (sc.pct < 97 || !sc.mono) allOk = false;

  const offs = [];
  let at = 0;
  for (const sen of doc.sentences) { offs.push(at); at += sen.length + 1; }
  const sentOf = rg.map(x => { let si = 0; offs.forEach((o, k) => { if (x.a >= o) si = k; }); return si; });

  doc.segs = doc.sentences.map((sen, si) =>
    toSegs(sen, rg.map((x, n) => [n, x]).filter(([n]) => sentOf[n] === si)
                  .map(([n, x]) => [n, { ...x, a: x.a - offs[si], b: x.b - offs[si] }])));
  doc.starts = doc.sentences.map((_, si) => {
    const mine = rg.filter((_x, n) => sentOf[n] === si);
    return mine.length ? Math.min(...mine.map(x => x.t)) : null;
  });
  if (doc.starts[0] == null) doc.starts[0] = 0;
  doc.ev = rg.map(x => ({ t: x.t, d: x.d }));
  delete doc.words;
  delete doc.sentence_starts;             // 옛 휴리스틱 키 — starts 가 대체한다
  const missed = doc.starts.filter(x => x == null).length;
  console.log(`  ${missed ? '⚠' : '✓'} 문장 시작점 ${doc.sentences.length - missed}/${doc.sentences.length} 매핑`);

  if (SAVE) writeFileSync(`${SAVE}/article-${doc.id}.mp3`, r.buf);
  if (!DRY) doc.audio_url = await put(`articles/${doc.id}.mp3`, r.buf);
}

doc.generated_at = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');

if (!DRY) {
  if (kind === 'scene') {
    await pushRow('eng_scenes', 'user_id,scene_id', {
      scene_id: doc.id, situation_ko: doc.situation_ko || '', topic: doc.topic || '일상',
      level: doc.level || 2, turns: doc.turns, ms: totalMs, vocab: vocabRows(doc),
    });
  } else {
    await pushRow('eng_articles', 'user_id,article_id', {
      article_id: doc.id, title: doc.title || '', topic: doc.topic || '테크', level: doc.level || 2,
      sentences: doc.sentences, segs: doc.segs, ev: doc.ev, starts: doc.starts,
      summary_ko: doc.summary_ko || [], sources: doc.sources || [], vocab: vocabRows(doc),
      audio_url: doc.audio_url || null, voice: doc.voice || '', ms: doc.ms,
    });
  }
  console.log(`  ✓ ${kind === 'scene' ? 'eng_scenes' : 'eng_articles'} 에 저장`);
}

if (kind === 'scene') {
  const used = new Set(doc.turns.filter(t => t.voice).map(t => t.voice));
  console.log(`  ${used.size >= 2 ? '✓' : '⚠'} 목소리 ${used.size}종 사용: ${[...used].map(v => v.replace(/^en-US-|MultilingualNeural$/g, '')).join(' · ')}`);
  if (used.size < 2) console.log('      ↳ 두 역할이 같은 목소리다 — 대화로 안 들린다');
}

console.log(`\n${allOk ? '✓' : '✗'} ${kind} "${doc.id}" — 오디오 ${(totalMs / 1000).toFixed(1)}초 · ` +
            `${(totalBytes / 1024).toFixed(0)}KB${DRY ? '' : ' · Storage 업로드 완료'}`);
console.log(`  타이밍을 ${FILE} 에 기록했다`);
if (sb) await sb.auth.signOut();
process.exit(allOk ? 0 : 1);
