#!/usr/bin/env node
/** 로그아웃은 **이 세션만**(scope:'local') 끊어야 한다.
 *  왜: supabase-js 의 signOut() 은 인자가 없으면 scope:'global' — 그 계정의 **모든 기기 세션을
 *  서버에서 지운다.** 스크립트 9개가 사용자 계정으로 로그인했다가 끝날 때 인자 없이 signOut() 을
 *  불러서, 스크립트가 돌 때마다 폰이 로그아웃됐다 (밤 보급은 매일 새벽, 작업하는 날은 30분마다).
 *  실험으로 확인: global → 다른 세션 "Invalid Refresh Token", local → 살아 있음. */
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';

const dir = new URL('./', import.meta.url);
const files = readdirSync(dir).filter(f => /\.(mjs|js|html)$/.test(f) && f !== 'check-signout.mjs');
const bad = [];
for (const f of files) {
  readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
    if (!/\bsignOut\(/.test(line)) return;
    if (/scope:\s*['"]local['"]/.test(line)) return;          // 이 세션만
    if (/signOut\s*=\s*\(opts\)|origSignOut\(opts\)/.test(line)) return;   // auth-log.js 의 감싸개(인자를 그대로 넘긴다)
    if (/^\s*(\/\/|\*)/.test(line)) return;                     // 주석
    bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 70)}`);
  });
}
assert.deepStrictEqual(bad, [], `scope:'local' 없는 signOut — 다른 기기까지 로그아웃된다:\n  ${bad.join('\n  ')}`);
console.log(`✓ 로그아웃 — 파일 ${files.length}개, 전부 이 세션만 끊는다`);
