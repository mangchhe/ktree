// 하루 모드 규칙만 떼어 돌린다. 깨지면: 그날 고른 모드가 다음 날까지 남거나, 주말 기본값이 틀린다.
import { readFileSync } from 'fs';
import assert from 'assert';
const h = readFileSync(new URL('./english.html', import.meta.url), 'utf8');

const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
let NOW = '2026-10-16', DOW = 5;                       // 금요일
globalThis.today = () => NOW;
globalThis.Date = class extends Date { getDay(){ return DOW; } };

const src = h.slice(h.indexOf("const OVR_KEY ="), h.indexOf("/* ── 출퇴근 통짜 트랙"));
const { dayMode, setTodayMode, todayOvr } =
  new Function(src + '; return { dayMode, setTodayMode, todayOvr };')();

assert.equal(dayMode(), 'office', '평일 기본은 출근');
DOW = 6; assert.equal(dayMode(), 'home', '토요일 기본은 재택');
DOW = 0; assert.equal(dayMode(), 'home', '일요일 기본은 재택');
DOW = 5;

// 그날만 재택
setTodayMode('home');
assert.equal(dayMode(), 'home');
assert.equal(todayOvr(), 'home');

// 날이 바뀌면 사라진다 — 매주 금요일이 재택으로 굳으면 안 된다
NOW = '2026-10-23';
assert.equal(todayOvr(), null, '고른 모드가 다음 주까지 남았다');
assert.equal(dayMode(), 'office');

// 주말에 "출근"(=카페에서 쪼개 하는 날)도 하루치로 선다
DOW = 6; NOW = '2026-10-24';
setTodayMode('office');
assert.equal(dayMode(), 'office');
NOW = '2026-10-31';
assert.equal(dayMode(), 'home', '주말 예외가 다음 주까지 남았다');

// 기본값과 같은 선택은 쌓아두지 않는다
setTodayMode('home');
assert.equal(todayOvr(), null, '의미 없는 예외가 남았다');

console.log('✓ 하루치 선택 · 주말 기본값 · 날짜 경과 전부 통과');
