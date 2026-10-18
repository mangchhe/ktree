// 오디오 경로 규칙. 깨지면 **에러 없이 전부 기기 TTS 로 떨어진다** — 그래서 검사가 있다.
//
//   node check-audiokey.mjs
//
// 1) tts-cards.mjs 가 english.html 에서 audioKey 를 떼어내는 그 방식이 지금도 먹히는지
//    (상수 이름만 바뀌어도 조용히 깨지고, 그러면 전부 엉뚱한 이름으로 구워진다)
// 2) 실제 어휘 663종에서 키가 겹치지 않는지 (겹치면 둘 중 하나가 남의 소리를 낸다)
import { readFileSync } from 'fs';
import assert from 'assert';

const here = new URL('.', import.meta.url);
const html = readFileSync(new URL('english.html', here), 'utf8');
const script = readFileSync(new URL('tts-cards.mjs', here), 'utf8');

// tts-cards.mjs 가 쓰는 것과 **같은** 잘라내기
const slice = html.slice(html.indexOf('function audioKey(s){'), html.indexOf('const CARD_AUD ='));
assert(slice.includes('function audioKey'), 'english.html 에서 audioKey 를 못 떼어냈다');
assert(script.includes("html.indexOf('const CARD_AUD =')")
    || script.includes("appHtml.indexOf('const CARD_AUD =')"),
  'tts-cards.mjs 의 잘라내기 기준이 바뀌었다 — 둘을 같이 고쳐야 한다');
const audioKey = new Function(slice + '; return audioKey;')();

// 공백·대소문자는 같은 것으로 묶는다 (슬러그와 해시 둘 다 정규화한다)
assert.equal(audioKey('  Hello   World '), audioKey('hello world'), '공백·대소문자 정규화가 안 맞는다');
// 구두점은 **해시에 남긴다** — 슬러그에선 지우지만 해시는 원문을 본다.
// 그래서 "Hello, world!" 와 "hello world" 는 다른 파일이 된다. 중복 한 장이 나는 대신
// 어떤 경우에도 소리가 글자와 정확히 같다. 아래 it's/its 가 그 덕에 안 뭉친다.
assert.notEqual(audioKey('Hello, world!'), audioKey('hello world'), '구두점이 해시에서 지워졌다');
assert.notEqual(audioKey("it's"), audioKey('its'), "it's / its 가 같은 키로 뭉쳤다");
// 긴 문장은 잘리지만 해시가 붙어 구분된다
const a = 'I was going to say that the deployment rollback is riskier than rolling forward right now';
const b = 'I was going to say that the deployment rollback is riskier than rolling forward later on';
assert.notEqual(audioKey(a), audioKey(b), '긴 문장이 잘려서 뭉쳤다');
// 파일 이름에 쓸 수 있는 글자만
for (const t of [a, 'blended ROAS', '  spaced  out  ', "don't—really"])
  assert.match(audioKey(t), /^[a-z0-9-]+$/, `파일 이름에 못 쓰는 글자: ${audioKey(t)}`);

// 실제 어휘에서 충돌 없는지
const terms = readFileSync(new URL('drafts/english/_terms.txt', here), 'utf8')
  .split('\n').map(x => x.trim()).filter(Boolean);
assert(terms.length > 500, `어휘 목록이 너무 짧다 (${terms.length}) — 덤프를 다시 떠라`);
const seen = new Map();
for (const t of terms) {
  const k = audioKey(t), norm = t.trim().toLowerCase().replace(/\s+/g, ' ');
  const prev = seen.get(k);
  if (prev !== undefined && prev !== norm)
    assert.fail(`키 충돌: ${JSON.stringify(prev)} vs ${JSON.stringify(norm)} → ${k}`);
  seen.set(k, norm);
}
console.log(`✓ 잘라내기 유효 · 어휘 ${terms.length}종 → 키 ${seen.size}개, 충돌 없음`);
