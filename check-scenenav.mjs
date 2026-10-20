#!/usr/bin/env node
/** 장면 재방문 검사 — 다 끝낸 뒤 들어가도 마지막 장면에 갇히지 않고,
 *  고르는 줄이 끝낸 개수를 맞게 표시한다.
 *  왜: done(진행도)을 들어갈 자리로 쓰는 바람에 5/5 가 되면 늘 5번 장면만 열렸다. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('function actScene(el){'), html.indexOf('/* 장면을 골라 가는 줄'))
          + html.slice(html.indexOf('function sceneNav(){'), html.indexOf('/* 🔴 어휘를 **본문 앞에**'));
assert.ok(src.includes('sceneNav') && src.includes('scIdx'), '추출 실패 — 함수 경계가 바뀌었다');

const make = new Function(`
  let scIdx = 0, scPhase = 'pre', tSession = null, tScenes = [];
  const drawScene = () => {};
  const esc = s => String(s);
  ${src}
  return {
    enter: (done, n) => { tSession = { progress:{ scenes:{ done } } };
      tScenes = Array.from({length:n}, (_, i) => ({ situation_ko:'s'+i }));
      scIdx = -99; actScene(null); return { scIdx, scPhase }; },
    nav: () => sceneNav(),
  };`)();

// 처음 / 중간 — 이어서 본다
assert.deepStrictEqual(make.enter(0, 5), { scIdx:0, scPhase:'pre' }, '처음엔 1번 어휘부터');
assert.deepStrictEqual(make.enter(2, 5), { scIdx:2, scPhase:'pre' }, '중간이면 하던 자리에서 이어야 한다');
// 다 끝낸 뒤 — 마지막에 갇히면 안 된다
assert.deepStrictEqual(make.enter(5, 5), { scIdx:0, scPhase:'dialog' }, '다 끝낸 뒤엔 1번부터 복습');
assert.deepStrictEqual(make.enter(9, 5), { scIdx:0, scPhase:'dialog' }, 'done 이 넘쳐도 같다');

// 고르는 줄
const nav = make.nav();                                  // 방금 enter(9,5) 상태 = 5개 전부 완료
assert.strictEqual((nav.match(/data-si=/g) || []).length, 5, '장면 수만큼 나와야 한다');
assert.strictEqual((nav.match(/✓/g) || []).length, 5, '끝낸 개수만큼 체크');
assert.ok(/class="tchip on" data-si="0"/.test(nav), '지금 장면에 on 이 와야 한다');
make.enter(1, 5);
assert.strictEqual((make.nav().match(/✓/g) || []).length, 1, '1개 끝냈으면 체크 1개');
make.enter(0, 1);
assert.strictEqual(make.nav(), '', '장면이 하나면 고를 게 없다');

console.log('✓ 장면 재방문 — 마지막에 갇히지 않고 아무 장면이나 고른다');
