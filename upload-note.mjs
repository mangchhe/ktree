#!/usr/bin/env node
/**
 * Tech Note 업로드 도구 — self-contained HTML 노트를 Supabase notes / notes_private 에 올린다.
 *
 *   node upload-note.mjs <file.html> [--private] [--slug s] [--title t] [--date d] [--summary s]
 *   node upload-note.mjs --list [--private]
 *   node upload-note.mjs --delete <slug> [--private]
 *
 * 인증: KTREE_EMAIL / KTREE_PASSWORD 환경변수 (Supabase Auth 계정).
 *   --private 는 user_access 에 access_type='private' 행이 있는 계정만 통과한다 (RLS).
 *
 * 메타데이터는 노트 파일 맨 앞의 주석 블록에서 읽는다:
 *   <!--ktree
 *   title: 실시간 WebSocket 게이트웨이
 *   date: 2026-09-03
 *   summary: 한 줄 요약
 *   -->
 * 없으면 <title> 과 파일명(YYYY-MM-DD-slug.html)에서 유추하고, CLI 플래그가 항상 우선한다.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// --- CLI 파싱 -------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const key = a.slice(2);
  if (key === 'private' || key === 'list') flags[key] = true;
  else flags[key] = argv[++i];
}

const TABLE = flags.private ? 'notes_private' : 'notes';

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// --- Supabase 접속 정보: 환경변수 우선, 없으면 index.html 에서 읽음 ----------
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

// .zshrc 는 인터랙티브 셸에서만 읽히므로, 에이전트/스크립트가 돌릴 때를 위해 .env 도 본다.
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
  if (!email || !password) {
    die('KTREE_EMAIL / KTREE_PASSWORD 가 필요합니다 — 환경변수(~/.zshenv)나 ktree/.env 에 설정하세요.');
  }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) die(`로그인 실패: ${error.message}`);
  return sb;
}

// --- 메타데이터 추출 -------------------------------------------------------
function parseMetaBlock(html) {
  const m = html.match(/<!--\s*ktree\s*\n([\s\S]*?)-->/i);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if (kv) meta[kv[1].toLowerCase()] = kv[2];
  }
  return meta;
}

function buildRecord(file) {
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') die(`파일이 없습니다: ${file}\n  템플릿에서 만들려면: cp drafts/templates/spec-note.html ${file}`);
    if (e.code === 'EISDIR') die(`디렉터리입니다 — HTML 파일 경로를 주세요: ${file}`);
    die(`파일을 읽을 수 없습니다 (${e.code}): ${file}`);
  }
  const meta = parseMetaBlock(html);
  const name = basename(file).replace(/\.html?$/i, '');

  const slug = flags.slug || meta.slug || name;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) {
    die(`slug 형식이 올바르지 않습니다: "${slug}" (영숫자 . _ - 만 허용)`);
  }

  const title = flags.title || meta.title || html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || slug;
  const date = flags.date || meta.date || name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
  const summary = flags.summary || meta.summary
    || html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || '';

  if (!summary) console.warn('⚠ summary 가 비어 있습니다 (목록 카드에 설명이 안 보입니다).');

  return { slug, title, date, summary, html, updated_at: new Date().toISOString() };
}

// --- 명령 ------------------------------------------------------------------
async function cmdList(sb) {
  const { data, error } = await sb.from(TABLE)
    .select('slug, title, date, summary')
    .order('date', { ascending: false });
  if (error) die(`조회 실패: ${error.message}`);
  if (!data.length) { console.log(`(${TABLE} 비어 있음)`); return; }
  console.log(`${TABLE} — ${data.length} notes\n`);
  for (const n of data) console.log(`  ${n.date || '----------'}  ${n.slug}\n      ${n.title}`);
}

async function cmdDelete(sb, slug) {
  const { error } = await sb.from(TABLE).delete().eq('slug', slug);
  if (error) die(`삭제 실패: ${error.message}`);
  console.log(`✓ 삭제됨: ${TABLE}/${slug}`);
}

async function cmdUpload(sb, file) {
  const rec = buildRecord(file);
  const { error } = await sb.from(TABLE).upsert(rec, { onConflict: 'slug' });
  if (error) die(`업로드 실패: ${error.message}`);
  const kb = (Buffer.byteLength(rec.html, 'utf8') / 1024).toFixed(1);
  console.log(`✓ ${TABLE}/${rec.slug}  (${kb} KB)`);
  console.log(`  title   ${rec.title}`);
  console.log(`  date    ${rec.date || '(없음)'}`);
  console.log(`  summary ${rec.summary || '(없음)'}`);
}

const sb = await connect();
try {
  if (flags.list) await cmdList(sb);
  else if (flags.delete) await cmdDelete(sb, flags.delete);
  else if (positional.length) await cmdUpload(sb, positional[0]);
  else die('업로드할 HTML 파일 경로가 필요합니다. (--list / --delete <slug> 도 사용 가능)');
} finally {
  await sb.auth.signOut();
}
