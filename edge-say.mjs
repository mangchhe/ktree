// Edge TTS — 파이썬 edge-tts 로 굽는다 (edge_say.py 머리말 참고: node 라이브러리가 막혔다).
//   synth(text, voice)  → { buf, words:[{t,d,w}] }          한 문장
//   synthBatch([{text, voice}]) → [{ buf|null, words, err }]  여러 개를 한 프로세스로(빠르다)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const UVX = [process.env.UVX, join(homedir(), '.local/bin/uvx'), '/opt/homebrew/bin/uvx'].find(p => p && existsSync(p)) || 'uvx';
const PY = new URL('./edge_say.py', import.meta.url).pathname;
// 버전을 고정한다 — 올라가면서 또 깨지면 어느 버전에서 됐는지 알아야 한다
const PKG = 'edge-tts==7.3.1';

export async function synthBatch(items) {
  if (!items.length) return [];
  const dir = mkdtempSync(join(tmpdir(), 'edge-say-'));
  try {
    const job = items.map((it, i) => ({ text: it.text, voice: it.voice, out: join(dir, `${i}.mp3`) }));
    const out = execFileSync(UVX, ['--quiet', '--from', PKG, 'python', PY],
      { input: JSON.stringify(job), encoding: 'utf8', maxBuffer: 64e6, timeout: 30 * 60e3 });
    return JSON.parse(out).map((r, i) => r.ok
      ? { buf: readFileSync(job[i].out), words: r.words }
      : { buf: null, words: [], err: r.err });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function synth(text, voice) {
  const [r] = await synthBatch([{ text, voice }]);
  if (!r.buf) throw new Error('TTS 실패: ' + r.err);
  return r;
}
