#!/usr/bin/env node
/** concatMp3 검사 — 순서가 섞이지 않고, 한 번에 받고, 하나라도 없으면 포기한다.
 *  왜: 하나씩 순서대로 받던 시절 어휘 Play all 이 몇 초 멈췄다. 병렬로 바꾸면
 *  응답이 도착하는 순서가 뒤섞이므로 **이어 붙이는 순서**가 깨질 수 있다. 둘 다 본다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('async function concatMp3(groups, onProgress){'),
                       html.indexOf('const buildPreTrack ='));
assert.ok(src.length > 200 && src.includes('Promise.all'), '추출 실패 — 함수 경계가 바뀌었다');

let live = 0, peak = 0;
const mk = (byte, len, delay) => ({ url:`u${byte}`, byte, len, delay });
const bodies = new Map();
globalThis.fetch = async u => {
  live++; peak = Math.max(peak, live);
  const b = bodies.get(u);
  await new Promise(r => setTimeout(r, b ? b.delay : 0));
  live--;
  if (!b) return { ok:false };
  return { ok:true, arrayBuffer: async () => new Uint8Array(b.len).fill(b.byte).buffer };
};
const concatMp3 = new Function(src + '; return concatMp3;')();

// 뒤에 있는 파일이 **먼저** 도착하게 해 순서가 유지되는지 본다
for (const b of [mk(1, 10, 40), mk(2, 20, 5), mk(3, 30, 20)]) bodies.set(b.url, b);
const t = await concatMp3([['u1'], ['u2', 'u3']], () => {});
assert.ok(t, '통짜가 만들어져야 한다');
assert.deepStrictEqual(t.marks, [0, 10], `marks 가 묶음 시작 위치여야 한다: ${t.marks}`);
assert.strictEqual(t.bytes, 60);
const all = new Uint8Array(await t.blob.arrayBuffer());
assert.deepStrictEqual([all[0], all[10], all[30]], [1, 2, 3], '도착 순서대로 붙었다 — 순서가 깨졌다');
assert.ok(peak > 1, `한 번에 받지 않는다 (최대 동시 ${peak}) — 다시 순차로 돌아갔다`);

// 하나라도 없으면 폴백(기기 TTS 체인)으로 넘겨야 한다
assert.strictEqual(await concatMp3([['u1'], ['없음']], () => {}), null, '빠진 파일을 못 걸렀다');
// 네트워크 예외도 폴백 — 전에는 throw 가 호출부로 튀어 Play all 이 죽었다
globalThis.fetch = async () => { throw new Error('offline'); };
assert.strictEqual(await concatMp3([['u1']], () => {}), null, '예외가 밖으로 튄다');

console.log(`✓ concatMp3 — 순서 유지 · 동시 ${peak}개 · 빠짐/예외는 폴백`);
