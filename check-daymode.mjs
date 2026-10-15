// 하루 모드 규칙만 떼어 돌린다. 깨지면: 하루 예외가 매주로 굳거나, 다음 날까지 남는다.
import { readFileSync } from 'fs';
import assert from 'assert';
const h = readFileSync('/Users/hajoo/prj/ktree/english.html', 'utf8');

const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
let NOW = '2026-10-16', DOW = 5;                       // 금요일
globalThis.today = () => NOW;
globalThis.Date = class extends Date { getDay(){ return DOW; } };

const src = h.slice(h.indexOf("const DAY_KEY ="), h.indexOf("const WEEK ="));
const { dayMode, setTodayMode, setWeekMode, weekMode, todayOvr } =
  new Function(src + '; return { dayMode, setTodayMode, setWeekMode, weekMode, todayOvr };')();

assert.equal(dayMode(), 'office', '금요일 기본은 출근');
assert.equal(weekMode(6), 'home', '토요일 기본은 재택');

// 오늘만 재택 → 오늘은 바뀌고, 금요일 기본값은 그대로
setTodayMode('home');
assert.equal(dayMode(), 'home');
assert.equal(weekMode(5), 'office', '하루 예외가 요일 기본값을 건드렸다');
assert.equal(todayOvr(), 'home');

// 날이 바뀌면 예외는 사라진다
NOW = '2026-10-17'; DOW = 6;
assert.equal(todayOvr(), null, '예외가 다음 날까지 남았다');
assert.equal(dayMode(), 'home', '토요일은 기본 재택');

// 요일 기본값을 바꾸면 그 요일은 매주 따라온다
NOW = '2026-10-21'; DOW = 3;                            // 수요일
assert.equal(dayMode(), 'office');
setWeekMode(3, 'home');
assert.equal(dayMode(), 'home');
NOW = '2026-10-28';
assert.equal(dayMode(), 'home', '다음 주 수요일에 안 따라왔다');

// 요일 기본값과 같은 예외는 쌓아두지 않는다
setTodayMode('home');
assert.equal(todayOvr(), null, '의미 없는 예외가 남았다');

// 오늘 요일의 기본값을 바꾸면 오늘치 예외는 치운다
setTodayMode('office');
assert.equal(todayOvr(), 'office');
setWeekMode(3, 'office');
assert.equal(todayOvr(), null, '기본값을 바꿨는데 예외가 남았다');

console.log('✓ 하루 예외 · 요일 기본값 · 날짜 경과 전부 통과');
