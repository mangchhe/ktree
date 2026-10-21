#!/usr/bin/env node
/** 어휘 탭 칩 숫자 = 눌렀을 때 나오는 개수.
 *  왜: 종류 칩(Word 163 · Phrase 295)이 상태와 무관하게 전체를 세서, Studied 를 고른 채
 *  "Phrase 295" 를 누르면 "Nothing studied yet" 이 떴다. 칩과 목록이 다른 계산을 쓰면 또 생긴다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const i = html.indexOf('  const isStudied = c =>'), j = html.indexOf('  head.innerHTML = `', i);
assert.ok(i > 0 && j > i, '추출 실패');
const facets = new Function('all', html.slice(i, j) + '; return { byStatus, byKind, cnt };');

// 상태·종류·찍기가 섞인 장부
const all = [
  { status:'new', kind:'word' }, { status:'new', kind:'phrase' }, { status:'new' /* kind 없음 = phrase */ },
  { status:'learning', kind:'word', flagged:true }, { status:'mature', kind:'phrase' },
  { status:'learning', kind:'phrase', flagged:true },
];
const { byStatus, byKind, cnt } = facets(all);
// 앱이 목록을 거르는 방식 그대로 — 칩 숫자와 같아야 한다
const rowsSrc = html.slice(j).match(/const rows = (all\.filter\([^;]+\));/)?.[1];
assert.ok(rowsSrc, '목록이 칩과 같은 술어(byStatus·byKind)로 거르지 않는다');
const rowsFor = new Function('all', 'byStatus', 'byKind', 'vbFilter', 'vbKind', `return ${rowsSrc};`);

for (const f of ['studied','new','mature','flagged','all'])
  for (const k of ['all','word','phrase'])
    assert.strictEqual(cnt(f, k), rowsFor(all, byStatus, byKind, f, k).length, `${f}+${k}: 칩 숫자와 목록 개수가 다르다`);

// 스크린샷 상황: 아무것도 안 배운 장부에서 Studied 를 고르면 종류 칩도 0 이어야 한다
const fresh = facets([{ status:'new', kind:'word' }, { status:'new', kind:'phrase' }]);
assert.deepStrictEqual(['all','word','phrase'].map(k => fresh.cnt('studied', k)), [0, 0, 0],
  'Studied 를 골랐는데 종류 칩이 전체를 센다');
assert.deepStrictEqual(['all','word','phrase'].map(k => fresh.cnt('all', k)), [2, 1, 1]);

console.log('✓ 어휘 칩 — 칩에 적힌 숫자 = 누르면 나오는 개수 (상태 5 × 종류 3)');
