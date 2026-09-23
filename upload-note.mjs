#!/usr/bin/env node
/**
 * Tech Note 업로드 도구 — self-contained HTML 노트를 Supabase notes / notes_private 에 올린다.
 *
 *   node upload-note.mjs <file.html> [--private] [--slug s] [--title t] [--date d] [--summary s] [--domain d] [--parent p]
 *   node upload-note.mjs --list [--private] [--domain d]
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
 *   domain: project-a     # 선택. 프로젝트별로 목록을 가른다 (project-a / project-b / …)
 *   parent: 2026-01-01-design   # 선택. **이 노트가 딸린 곳**의 slug.
 *                               # 딸린 노트는 목록에 안 뜨고 부모 옆에 붙는다
 *   -->
 *
 * domain / parent 는 같은 이름의 컬럼에 들어간다. 컬럼이 아직 없으면 업로드가
 * 실패하면서 필요한 SQL 을 알려준다 — 그것만 Supabase SQL editor 에서 돌리면 된다.
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

// notes_private 는 `LIKE notes INCLUDING ALL` 로 만들어져 **생성 시점에 복사**된 것이라
// 둘이 따로 논다. 한쪽만 고치면 공개/비공개 중 하나가 조용히 어긋난다.
const DOMAIN_SQL = `
  다음 SQL 을 Supabase SQL editor 에서 한 번 실행하세요:

    ALTER TABLE public.notes         ADD COLUMN IF NOT EXISTS domain text;
    ALTER TABLE public.notes_private ADD COLUMN IF NOT EXISTS domain text;
    ALTER TABLE public.notes         ADD COLUMN IF NOT EXISTS parent text;
    ALTER TABLE public.notes_private ADD COLUMN IF NOT EXISTS parent text;
    CREATE INDEX IF NOT EXISTS idx_notes_domain         ON public.notes (domain);
    CREATE INDEX IF NOT EXISTS idx_notes_private_domain ON public.notes_private (domain);
    CREATE INDEX IF NOT EXISTS idx_notes_parent         ON public.notes (parent);
    CREATE INDEX IF NOT EXISTS idx_notes_private_parent ON public.notes_private (parent);
`;

// PostgREST 는 없는 컬럼을 42703 으로 돌려준다. 메시지 문자열에만 기대지 않는다
function isMissingColumn(err) {
  return err && (err.code === '42703' || /\b(domain|parent)\b/i.test(err.message || ''));
}

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

  const domain = (flags.domain || meta.domain || '').trim().toLowerCase();
  if (domain && !/^[a-z0-9][a-z0-9_-]*$/.test(domain)) {
    die(`domain 형식이 올바르지 않습니다: "${domain}" (소문자 영숫자 _ - 만 허용)`);
  }
  if (!domain) {
    console.warn('⚠ domain 이 비어 있습니다 — 목록에서 "미분류"로 묶입니다.');
  }

  // **딸린 곳.** 원문·측정기록처럼 혼자서는 뜻이 없는 문서를 설계 노트에 붙인다.
  const parent = (flags.parent || meta.parent || '').trim();
  if (parent) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(parent)) die(`parent 형식이 올바르지 않습니다: "${parent}"`);
    if (parent === slug) die('parent 가 자기 자신입니다 — 노트는 자기에게 딸릴 수 없습니다.');
  }

  const rec = { slug, title, date, summary, html, updated_at: new Date().toISOString() };
  // **없으면 아예 안 보낸다.** null 을 보내면 컬럼이 없는 DB 에서 같은 에러가 나는데,
  // domain 을 안 쓰는 사람까지 스키마 변경을 강요받을 이유가 없다
  if (domain) rec.domain = domain;
  if (parent) rec.parent = parent;
  return rec;
}

// --- 명령 ------------------------------------------------------------------
async function cmdList(sb) {
  // domain 컬럼이 아직 없는 DB 에서도 목록은 떠야 한다 — 한 번 더 시도한다
  // 있는 컬럼만큼 쓴다 — 스키마를 아직 안 고친 환경에서도 목록은 떠야 한다
  let data, error, cols = 'slug, title, date, summary, domain, parent';
  ({ data, error } = await sb.from(TABLE).select(cols).order('date', { ascending: false }));
  for (const fallback of ['slug, title, date, summary, domain', 'slug, title, date, summary']) {
    if (!error || !isMissingColumn(error)) break;
    cols = fallback;
    ({ data, error } = await sb.from(TABLE).select(cols).order('date', { ascending: false }));
  }
  if (error) die(`조회 실패: ${error.message}`);
  if (!cols.includes('parent')) console.warn('⚠ 스키마가 오래됐습니다.\n' + DOMAIN_SQL + '\n');

  let rows = data || [];
  if (flags.domain) rows = rows.filter(n => (n.domain || '') === flags.domain);
  if (!rows.length) { console.log(`(${TABLE}${flags.domain ? ` · domain=${flags.domain}` : ''} 비어 있음)`); return; }

  // **도메인별로 묶어서 낸다.** 섞여 있으면 목록이 길어질수록 읽을 수가 없다
  const groups = new Map();
  for (const n of rows) {
    const d = n.domain || '(미분류)';
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(n);
  }
  const names = [...groups.keys()].sort((a, b) =>
    a === '(미분류)' ? 1 : b === '(미분류)' ? -1 : a.localeCompare(b));

  // 🔵 **딸린 노트는 부모 밑에 들여쓴다.** 목록에서 빼버리면 "있다는 것"조차
  //    모르게 된다 — 화면에서는 숨기지만 여기서는 보여야 관리가 된다
  const kids = new Map();
  for (const n of rows) if (n.parent) {
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n);
  }
  // 이음줄(└)은 **첫 줄에만** — 제목 줄에도 붙으면 가지가 둘로 보인다
  const line = (n, ind, cont = ' '.repeat(ind.length)) =>
    `${ind}${n.date || '----------'}  ${n.slug}\n${cont}    ${n.title}`;

  console.log(`${TABLE} — ${rows.length} notes · ${names.length} domains\n`);
  for (const d of names) {
    const g = groups.get(d).filter(n => !n.parent);
    console.log(`  [${d}] ${g.length}`);
    for (const n of g) {
      console.log(line(n, '    '));
      for (const k of (kids.get(n.slug) || [])) console.log(line(k, '      └ '));
    }
    console.log('');
  }

  // 부모가 없는 딸린 노트는 **화면에서 영영 안 보인다** — 조용히 사라지면 안 된다
  const slugs = new Set(rows.map(n => n.slug));
  const orphans = rows.filter(n => n.parent && !slugs.has(n.parent));
  if (orphans.length) {
    console.warn(`⚠ 부모가 없는 노트 ${orphans.length}개 — 목록에 안 뜹니다:`);
    for (const o of orphans) console.warn(`    ${o.slug}  →  parent: ${o.parent} (없음)`);
  }
}

async function cmdDelete(sb, slug) {
  const { error } = await sb.from(TABLE).delete().eq('slug', slug);
  if (error) die(`삭제 실패: ${error.message}`);
  console.log(`✓ 삭제됨: ${TABLE}/${slug}`);
}

async function cmdUpload(sb, file) {
  const rec = buildRecord(file);

  // 🔴 **부모를 오타내면 노트가 어디에도 안 뜬다.** 목록에서는 딸린 것이라
  //    숨고, 부모가 없으니 붙을 자리도 없다 — 올리기 전에 막는다.
  //    2단 중첩도 막는다: 화면이 한 단만 그린다
  if (rec.parent) {
    const { data, error } = await sb.from(TABLE)
      .select('slug, parent').eq('slug', rec.parent).maybeSingle();
    if (error && !isMissingColumn(error)) die(`부모 확인 실패: ${error.message}`);
    if (!error) {
      if (!data) die(`parent "${rec.parent}" 가 ${TABLE} 에 없습니다.\n  ` +
                     `먼저 부모 노트를 올리세요 (--list 로 slug 확인).`);
      if (data.parent) die(`parent "${rec.parent}" 도 다른 노트에 딸려 있습니다 — ` +
                           `**한 단까지만** 붙일 수 있습니다.`);
    }
  }
  const { error } = await sb.from(TABLE).upsert(rec, { onConflict: 'slug' });
  if (error && isMissingColumn(error)) {
    die(`업로드 실패 — domain 컬럼이 아직 없습니다.\n${DOMAIN_SQL}\n  ` +
        `(분류 없이 올리려면 노트의 domain: 줄을 지우세요)`);
  }
  if (error) die(`업로드 실패: ${error.message}`);
  const kb = (Buffer.byteLength(rec.html, 'utf8') / 1024).toFixed(1);
  console.log(`✓ ${TABLE}/${rec.slug}  (${kb} KB)`);
  console.log(`  title   ${rec.title}`);
  console.log(`  date    ${rec.date || '(없음)'}`);
  console.log(`  summary ${rec.summary || '(없음)'}`);
  console.log(`  domain  ${rec.domain || '(미분류)'}`);
  console.log(`  parent  ${rec.parent || '(없음 — 목록에 뜹니다)'}`);
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
