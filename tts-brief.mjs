#!/usr/bin/env node
/**
 * 브리핑 스크립트 → 네이티브급 mp3 (MS Edge 뉴럴 TTS, 무료·키 불필요)
 *
 *   node tts-brief.mjs <brief.json|script.txt> <out.mp3> [voice]
 *
 * brief.json 이면 .script 필드를 읽는다. 기본 음성: en-US-AndrewMultilingualNeural
 * (다른 추천: en-US-AvaMultilingualNeural, en-US-EmmaMultilingualNeural, en-GB-RyanNeural)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const [input, out, voice = 'en-US-AndrewMultilingualNeural'] = process.argv.slice(2);
if (!input || !out) {
  console.error('사용법: node tts-brief.mjs <brief.json|script.txt> <out.mp3> [voice]');
  process.exit(1);
}

let text = readFileSync(input, 'utf8');
if (input.endsWith('.json')) {
  const j = JSON.parse(text);
  if (!j.script) { console.error('✗ JSON 에 script 필드가 없습니다.'); process.exit(1); }
  text = j.script;
}

const tts = new MsEdgeTTS();
await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
const { audioStream } = await tts.toStream(text);

const chunks = [];
audioStream.on('data', c => chunks.push(c));
audioStream.on('end', () => {
  const buf = Buffer.concat(chunks);
  if (buf.length < 1000) { console.error('✗ 오디오가 비정상적으로 작습니다 — 네트워크/음성 이름 확인'); process.exit(1); }
  writeFileSync(out, buf);
  console.log(`✓ ${out} (${(buf.length / 1024).toFixed(0)} KB, ${voice})`);
  process.exit(0);
});
audioStream.on('error', e => { console.error('✗', e.message); process.exit(1); });
