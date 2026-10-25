// 스피킹 녹음 교정 일꾼. launchd 가 1분마다 부른다 (speak-fix.sh).
//
//   앱: 녹음 → eng-speak 버킷 + eng_speak_fix(pending)
//   여기: 받아쓰기(whisper-cli, 로컬) → 교정(claude -p) → done
//
// 🔴 매분 signInWithPassword 하지 않는다. 비번 로그인은 속도 제한이 있고, 매번 세션을 만들고
//    지우게 된다. 폰처럼 **세션 하나를 파일에 두고 계속 쓴다** (~/.config/ktree, 600).
//    그래서 signOut 도 안 한다 — 하면 이 Mac 의 세션이 끝난다 (local 이라 폰은 무사하지만).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { synthBatch } from './edge-say.mjs';

export const STAGE_RULE = {
  1: '현재시제 위주의 짧은 문장(문장당 13단어 이하) 3~6개. am/is/are, I + 동사, There is, can 정도만.',
  2: '짧은 문장 3~6개. 과거시제(went, was, did)와 현재시제를 구분해서.',
  3: '문장 5~8개. because, so, but, when 으로 이어 말하기. 시작-중간-마무리.',
  4: '실전 오픽 IM~IH 답. 7~10문장, 예시·느낌·마무리 포함.',
};

export function buildPrompt({ question_en, question_ko, kind, model_l1, stage, transcript }) {
  return `너는 오픽(OPIc) 영어 스피킹 코치다. 학습자는 현재 NH 등급(초보)이고, 앱의 단계는 S${stage}다.
이 단계의 목표 답 수준: ${STAGE_RULE[stage] || STAGE_RULE[1]}

질문(${kind}): ${question_en}
질문 뜻: ${question_ko || ''}
${model_l1 ? `이 단계 모범답 예시: ${model_l1}\n` : ''}
학습자가 말한 것(음성 인식 결과, 오인식·한국어 섞임 가능):
"""${transcript}"""

할 일:
1. 학습자가 **원래 말하려던 내용**을 짐작한다. 인식이 엉망이어도 맥락으로 최대한 살린다.
2. 그 내용을 살려서 **이 단계 수준의** 자연스러운 영어 답으로 고친다. 모범답으로 갈아치우지 말고 학습자의 내용을 쓴다.
3. 가장 중요한 실수부터 최대 5개를 짚는다. 설명은 한국어, 문법 용어는 최소로, 초보가 알아듣게.

JSON 하나만 출력한다. 다른 글자 없이:
{"intent_ko":"네가 하려던 말 (한국어 1~2문장)",
 "fixed":"고친 전체 답 (영어)",
 "fixes":[{"said":"학습자가 말한 부분","better":"고친 표현","why_ko":"왜 (한국어 한 줄)"}],
 "good_ko":"잘한 점 한 줄",
 "next_ko":"다음 번에 딱 하나만 신경 쓸 것"}
말한 게 거의 없거나 인식이 비었으면 fixes 는 [] 로 두고 fixed 에 이 질문에 대한 이 단계 수준의 쉬운 답을 쓴다.`;
}

/** 구울 문장들 — 고친 답의 문장 + 고친 표현. 앱의 재생 버튼이 누르는 단위 그대로다. */
export function bakeTexts(fix, split) {
  return [...new Set([...split(fix.fixed), ...fix.fixes.map(f => f.better)].map(t => String(t).trim()).filter(Boolean))];
}

/** claude 출력에서 JSON 을 꺼낸다. 코드펜스·앞뒤 말이 붙어도 첫 { 부터 마지막 } 까지. */
export function parseFix(out) {
  const s = out.indexOf('{'), e = out.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('JSON 없음');
  const j = JSON.parse(out.slice(s, e + 1));
  if (typeof j.fixed !== 'string' || !j.fixed.trim()) throw new Error('fixed 없음');
  j.fixes = Array.isArray(j.fixes) ? j.fixes.filter(f => f && f.better).slice(0, 5) : [];
  return j;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const CFG = join(homedir(), '.config', 'ktree');
  const SESS = join(CFG, 'speak-fix-session.json');
  const MODEL = join(homedir(), '.cache', 'whisper', 'ggml-small.bin');
  const CLAUDE = join(homedir(), '.local', 'bin', 'claude');
  mkdirSync(CFG, { recursive: true });

  // 파일 저장소 — supabase-js 가 세션을 여기 읽고 쓴다(갱신된 토큰 포함)
  const load = () => { try { return JSON.parse(readFileSync(SESS, 'utf8')); } catch { return {}; } };
  const storage = {
    getItem: k => load()[k] ?? null,
    setItem: (k, v) => { const o = load(); o[k] = v; writeFileSync(SESS, JSON.stringify(o)); chmodSync(SESS, 0o600); },
    removeItem: k => { const o = load(); delete o[k]; writeFileSync(SESS, JSON.stringify(o)); },
  };
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  // 글자키·문장 나누기는 앱에서 읽는다 (tts-cards.mjs 와 같은 이유 — 베끼면 어긋난다)
  const app = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
  const audioKey = new Function(app.slice(app.indexOf('function audioKey(s){'), app.indexOf('const CARD_AUD =')) + '; return audioKey;')();
  const sentences = new Function(app.slice(app.indexOf('const sentences ='), app.indexOf('\n', app.indexOf('const sentences ='))) + '; return sentences;')();
  const VOICE = readFileSync(new URL('./tts-cards.mjs', import.meta.url), 'utf8').match(/'(en-US-[A-Za-z]+Neural)'/)[1];
  // 🔊 고친 답을 원어민 음성으로 굽는다 → eng-audio/cards/t/<글자키>.mp3. 앱의 playCard 가
  //    이 경로를 먼저 찾으므로 따로 배선할 게 없다. 실패해도 교정은 살린다(앱은 기기 음성으로 읽는다).
  async function bake(texts) {
    let n = 0;
    const got = await synthBatch(texts.map(text => ({ text, voice: VOICE })));
    for (const [i, r] of got.entries()) {
      if (!r.buf) continue;
      const { error } = await sb.storage.from('eng-audio').upload(`cards/t/${audioKey(texts[i])}.mp3`, r.buf,
        { contentType: 'audio/mpeg', upsert: true });
      if (!error) n++;
    }
    return n;
  }

  const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
    html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1],
    { auth: { storage, persistSession: true, autoRefreshToken: false } });

  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    // 처음 한 번, 또는 세션이 죽었을 때만
    const { data, error } = await sb.auth.signInWithPassword({
      email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
    if (error) { console.error('✗ 로그인 실패:', error.message); process.exit(1); }
    session = data.session;
    console.log('· 새 세션');
  }

  // 일하다 죽은 것(10분 넘게 working)은 다시 줍는다
  const stale = new Date(Date.now() - 10 * 60e3).toISOString();
  const { data: rows, error: e1 } = await sb.from('eng_speak_fix')
    .select('*, eng_prompts(question_en, question_ko, kind, model_l1)')
    .or(`status.eq.pending,and(status.eq.working,created_at.lt.${stale})`)
    .order('created_at').limit(5);
  if (e1) { console.error('✗', e1.message); process.exit(1); }

  for (const r of rows || []) {
    const t0 = Date.now();
    await sb.from('eng_speak_fix').update({ status: 'working' }).eq('id', r.id);
    const dir = join(tmpdir(), 'ktree-speak-' + r.id);
    mkdirSync(dir, { recursive: true });
    try {
      const { data: blob, error } = await sb.storage.from('eng-speak').download(r.audio_path);
      if (error) throw new Error('녹음 받기 실패: ' + error.message);
      const src = join(dir, 'in'), wav = join(dir, 'in.wav');
      writeFileSync(src, Buffer.from(await blob.arrayBuffer()));
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', wav]);
      // 영어로 고정한다 — auto 면 한국어 섞인 초보 답을 한국어로 판정해 통째로 번역해버린다
      const transcript = execFileSync('whisper-cli',
        ['-m', MODEL, '-f', wav, '-l', 'en', '-nt', '-np'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .replace(/\s+/g, ' ').trim();
      const prompt = buildPrompt({ ...r.eng_prompts, stage: r.stage, transcript });
      // 빈 디렉터리에서 돌린다 — 리포의 CLAUDE.md·스킬을 끌고 오면 느려지고 엉뚱해진다
      const out = execFileSync(CLAUDE, ['-p', prompt, '--model', 'sonnet', '--permission-mode', 'dontAsk'],
        { cwd: dir, encoding: 'utf8', timeout: 180e3, maxBuffer: 4e6 });
      const result = parseFix(out);
      const texts = bakeTexts(result, sentences);
      try { result.audio = (await bake(texts)) === texts.length; }
      catch (e) { result.audio = false; console.error('  음성 굽기 실패:', e.message); }
      const { error: e2 } = await sb.from('eng_speak_fix').update({
        status: 'done', transcript, result, error: null, done_at: new Date().toISOString() }).eq('id', r.id);
      if (e2) throw new Error(e2.message);
      console.log(`✓ ${r.id.slice(0, 8)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (err) {
      console.error(`✗ ${r.id.slice(0, 8)}`, err.message);
      await sb.from('eng_speak_fix').update({ status: 'error', error: String(err.message).slice(0, 500) }).eq('id', r.id);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}
