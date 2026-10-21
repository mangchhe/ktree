#!/usr/bin/env node
/** 앱 스크립트가 통째로 파싱되는가.
 *  왜: 다른 check-* 는 함수를 **조각으로** 떼어 돌린다. 그래서 같은 함수 안에서 이름을 두 번
 *  선언해(const did) 앱 전체가 SyntaxError 로 죽는 경우를 하나도 못 잡았다. 이게 그 그물이다. */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./english.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
if (!m) { console.error('✗ 앱 스크립트를 못 찾았다'); process.exit(1); }
try { new Function(m[1]); }
catch (e) { console.error(`✗ 앱 스크립트가 파싱 안 된다 — 이대로 배포하면 앱이 통째로 안 돈다\n  ${e.message}`); process.exit(1); }
console.log('✓ 앱 스크립트 파싱');
