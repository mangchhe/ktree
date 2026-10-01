#!/usr/bin/env node
/**
 * 독백 프롬프트 업로드 (오픽 대비).
 *
 *   node seed-prompts.mjs                  내장 시드 9개를 넣는다 (최초 1회)
 *   node seed-prompts.mjs <file.json>      밤 보급이 만든 묶음을 넣는다
 *   node seed-prompts.mjs <file.json> --dry  넣지 않고 검증만
 *
 * JSON 은 배열이다:
 *   [{ kind, topic, level, seconds, question_en, hint_ko, model_en, model_note_ko,
 *      phrases:[{term, meaning_ko}] }]
 *
 * kind 는 오픽 문항 유형 — describe · habit · past · compare · ask · solve.
 * 🔴 ask(질문 만들기)를 빠뜨리지 말 것. "나에게 X에 대해 세 가지 물어봐"는 반드시
 *    나오는데, 답하는 훈련만 하면 그 자리에서 말문이 막힌다.
 *
 * 🔴 topic 은 eng_topics.name 과 **같은 한국어 값**이어야 한다. 어긋나면 에러 없이
 *    필터에서 조용히 빠져 영영 안 뽑힌다 (실제로 '운동' 으로 넣었다가 고아가 됐다).
 *
 * model_en 은 **문단 구조가 보이게** 쓴다 (빈 줄로 문단 구분). 등급을 가르는 것이
 * text type 이라, 좋은 내용을 문장 단위로 늘어놓으면 IM 천장에 걸린다.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const P = [
  // ── describe ────────────────────────────────────────────
  { kind:'describe', topic:'일상', level:2, seconds:75,
    question_en:"Tell me about the place where you live. What does it look like, and what do you like about it?",
    hint_ko:'사는 곳을 묘사해봐 — 전체 인상 → 구체적인 방/공간 → 가장 마음에 드는 점 순서로',
    model_en:"I live in a two-bedroom apartment on the fifth floor, and honestly it's nothing fancy, but it works for me.\n\nThe part I spend the most time in is the living room. There's a big window facing south, so in the afternoon the whole room gets this warm light, and I usually end up working there instead of at my desk.\n\nWhat I like most is actually the location. There's a park about five minutes away, and a decent coffee shop right downstairs. So even when I don't feel like going far, I still have somewhere to go.",
    model_note_ko:'세 문단 — 전체 → 한 공간 집중 → 왜 좋은지. 각 문단이 한 가지만 다룬다. 이 구조가 IH 를 만든다.',
    phrases:[{term:"it's nothing fancy, but",meaning_ko:'대단한 건 아니지만'},
             {term:'the part I spend the most time in',meaning_ko:'내가 가장 많은 시간을 보내는 곳'},
             {term:'end up -ing',meaning_ko:'결국 ~하게 되다'},
             {term:'what I like most is',meaning_ko:'내가 제일 좋아하는 건'}] },

  { kind:'describe', topic:'일상', level:3, seconds:90,
    question_en:"Describe a person you spend a lot of time with. What are they like, and how did you meet?",
    hint_ko:'자주 보는 사람 한 명 — 어떤 사람인지 → 어떻게 만났는지 → 왜 잘 맞는지',
    model_en:"The person I probably see the most is a friend I met at my first job. We were on the same team for about two years.\n\nPersonality-wise, we're pretty different. He's the type who plans everything two weeks ahead, and I'm more of a decide-on-the-day person. But that's actually why it works — he drags me out when I'd rather stay home, and I stop him from overthinking things.\n\nWe met in a kind of unglamorous way. We were both stuck fixing a production issue at eleven at night, and after that you just end up close to someone.",
    model_note_ko:'"어떤 사람"을 형용사 나열이 아니라 **대비**로 보여준다. 마지막 문단은 구체적 일화 하나 — 추상적 설명보다 점수가 높다.',
    phrases:[{term:'personality-wise',meaning_ko:'성격으로 말하자면'},
             {term:"he's the type who",meaning_ko:'그는 ~하는 타입이다'},
             {term:"that's actually why it works",meaning_ko:'사실 그래서 잘 맞는다'},
             {term:'end up close to someone',meaning_ko:'어쩌다 가까워지다'}] },

  // ── habit ───────────────────────────────────────────────
  { kind:'habit', topic:'일상', level:2, seconds:75,
    question_en:"Walk me through a typical weekday for you, from the morning until you go to bed.",
    hint_ko:'평일 하루 흐름 — 아침·낮·저녁으로 묶고, 중간에 하나는 구체적으로',
    model_en:"My weekdays are pretty routine, which honestly I don't mind.\n\nI'm up around seven, and the first thing I do is make coffee — that part is non-negotiable. I'm at my desk by nine, and the morning is usually when I get the actual work done, because nobody's messaging yet.\n\nAfternoons are more scattered. Meetings, reviews, people asking questions. And in the evening I try to get away from the screen — I'll go for a walk or cook something, nothing special. I'm usually in bed by midnight, though that slips more often than I'd like.",
    model_note_ko:'시간 순서를 **덩어리**로 묶는다(아침·오후·저녁). 분 단위로 나열하면 문장 단위 말하기가 되어 등급이 안 오른다.',
    phrases:[{term:'that part is non-negotiable',meaning_ko:'그건 절대 안 빼먹는다'},
             {term:'get the actual work done',meaning_ko:'진짜 일을 해낸다'},
             {term:'more scattered',meaning_ko:'더 산만한'},
             {term:'that slips more often than I’d like',meaning_ko:'생각보다 자주 어긋난다'}] },

  { kind:'habit', topic:'일상', level:2, seconds:75,
    question_en:"You said you like staying active. What do you usually do, and how often?",
    hint_ko:'운동 습관 — 뭘 하는지 → 얼마나 자주 → 왜 그걸 고르게 됐는지',
    model_en:"I'm not someone who's at the gym every day, but I try to move three or four times a week.\n\nMostly I run. There's a river path near my place, and I'll do maybe five kilometers — slow, nothing impressive. On weekends I go a bit longer if the weather's decent.\n\nI picked running because it's the lowest-friction thing I could find. No booking, no equipment, no one to coordinate with. I just put my shoes on and go. Anything more complicated than that and I know I'd stop doing it.",
    model_note_ko:'"왜 그걸 하는가"에 **이유 하나를 깊게** 판다. 여러 이유를 얕게 나열하는 것보다 낫다.',
    phrases:[{term:"I'm not someone who",meaning_ko:'나는 ~하는 사람은 아니다'},
             {term:'nothing impressive',meaning_ko:'대단할 건 없다'},
             {term:'the lowest-friction thing',meaning_ko:'가장 번거롭지 않은 것'},
             {term:'anything more complicated than that',meaning_ko:'그보다 복잡하면'}] },

  // ── past ────────────────────────────────────────────────
  { kind:'past', topic:'여행', level:3, seconds:90,
    question_en:"Tell me about a trip that didn't go as planned. What happened, and how did you handle it?",
    hint_ko:'계획이 틀어진 여행 — 상황 설정 → 무슨 일이 → 어떻게 수습 → 지금 와서 보면',
    model_en:"A couple of years ago I went to Osaka for four days, and the whole thing nearly fell apart on day one.\n\nI landed in the evening and realized I'd booked the hotel for the wrong week. The front desk was very polite about it, but they were completely full, and so was everywhere nearby — it was a holiday weekend.\n\nSo I spent about two hours on my phone in the lobby, and eventually found a tiny place forty minutes out. Not what I'd planned, but it had a train station right there.\n\nLooking back, it turned out better. That neighborhood was where people actually lived, not where tourists go, and the food was the best part of the trip.",
    model_note_ko:'과거 서술은 **시간 순 + 전환점**. 마지막 문단의 "지금 와서 보면"이 문단을 엮어 AL 쪽으로 민다.',
    phrases:[{term:'nearly fell apart',meaning_ko:'하마터면 망할 뻔했다'},
             {term:'they were completely full',meaning_ko:'자리가 꽉 찼었다'},
             {term:'not what I’d planned',meaning_ko:'계획했던 건 아니지만'},
             {term:'looking back, it turned out better',meaning_ko:'돌이켜보면 오히려 잘됐다'}] },

  // ── compare ─────────────────────────────────────────────
  { kind:'compare', topic:'일상', level:3, seconds:90,
    question_en:"How has the way you spend your free time changed compared to five years ago?",
    hint_ko:'예전 vs 지금 — 각각을 한 문단씩, 마지막에 왜 바뀌었는지',
    model_en:"Five years ago my free time was mostly social. I'd be out three or four nights a week, meeting people, going to things. If I had an empty evening I'd try to fill it.\n\nNow it's almost the opposite. I still see people, but far less often, and I plan it instead of just showing up. Most evenings I'm home, and I'm genuinely fine with that.\n\nI think two things changed. The obvious one is that work got heavier, so I have less energy to spend. But the bigger one is that I stopped feeling like an empty evening was a problem to solve. That took a while to get to.",
    model_note_ko:'비교는 **대칭 구조**로. 예전 한 문단 · 지금 한 문단 · 왜 한 문단. 그리고 "표면적 이유 → 진짜 이유"로 깊이를 준다.',
    phrases:[{term:"I'd try to fill it",meaning_ko:'비어 있으면 채우려 했다'},
             {term:"it's almost the opposite",meaning_ko:'거의 정반대다'},
             {term:"I'm genuinely fine with that",meaning_ko:'그게 정말 괜찮다'},
             {term:'a problem to solve',meaning_ko:'해결해야 할 문제'}] },

  // ── ask (질문 만들기) ───────────────────────────────────
  { kind:'ask', topic:'일상', level:2, seconds:60,
    question_en:"I just moved to a new neighborhood. Ask me three or four questions about it.",
    hint_ko:'질문 3~4개를 만들어 말해봐. 평서문이 아니라 **의문문**이어야 한다',
    model_en:"Oh nice, congratulations. Can I ask you a few things about it?\n\nFirst — what made you pick that area? Was it the commute, or something else?\n\nAnd what's the neighborhood actually like day to day? Like, is there anywhere decent to eat nearby, or do you have to go out for that?\n\nOne more — how's the noise? I've been bitten by that before, so I always ask.",
    model_note_ko:'🔴 오픽에서 반드시 나오는 유형인데 가장 많이 막힌다. 질문을 **덩어리로 묶고** 사이에 한마디를 끼워 넣으면 자연스럽고 분량도 찬다.',
    phrases:[{term:'Can I ask you a few things about it?',meaning_ko:'몇 가지 물어봐도 될까?'},
             {term:'what made you pick',meaning_ko:'왜 ~을 고르게 됐어?'},
             {term:'what’s it actually like day to day',meaning_ko:'실제로 지내보면 어때?'},
             {term:"I've been bitten by that before",meaning_ko:'전에 그걸로 당한 적 있어서'}] },

  { kind:'ask', topic:'비즈니스', level:3, seconds:60,
    question_en:"I'm thinking about changing jobs. Ask me three or four questions to help me decide.",
    hint_ko:'이직을 고민하는 사람에게 할 질문 3~4개 — 표면적인 것 말고 결정에 도움이 되는 것으로',
    model_en:"Sure, happy to think it through with you. Let me ask a few things.\n\nWhat's actually pushing you out? I mean, is it the work itself, or the people, or just that you've stopped learning?\n\nAnd if nothing changed at your current place — same team, same project — would you still want to leave a year from now?\n\nLast one. What would the new role give you that you can't get where you are? Because sometimes that turns out to be something you could just ask for.",
    model_note_ko:'질문의 **질**도 평가에 들어간다. yes/no 로 끝나는 질문만 던지면 답이 짧아져 대화가 안 굴러간다.',
    phrases:[{term:"what's actually pushing you out",meaning_ko:'진짜로 나가고 싶게 만드는 게 뭐야'},
             {term:"you've stopped learning",meaning_ko:'더 배울 게 없어졌다'},
             {term:'a year from now',meaning_ko:'지금부터 1년 뒤에'},
             {term:'something you could just ask for',meaning_ko:'그냥 요청하면 되는 것'}] },

  // ── solve ───────────────────────────────────────────────
  { kind:'solve', topic:'여행', level:3, seconds:75,
    question_en:"You arrive at your hotel and they have no record of your booking. Explain the situation and work out a solution.",
    hint_ko:'상황 설명 → 증거 제시 → 대안 요청 → 양보선 제시. 화내지 말고 해결로 간다',
    model_en:"Hi — I think there's a problem with my reservation, and I'm hoping you can help me sort it out.\n\nI booked a double room for three nights back in August, and I have the confirmation email right here with the reference number. But you're saying there's nothing under my name?\n\nI understand it might be on the booking site's end rather than yours. What I'd like to know is whether you have anything available tonight, even a smaller room — I can sort out the rest in the morning when their support is open.\n\nIf you're completely full, could you call a nearby property for me? It's almost midnight and I'd really rather not start over.",
    model_note_ko:'문제 해결형은 **단계가 보여야** 한다: 문제 → 근거 → 요청 → 차선. 감정 표현보다 단계 구조가 점수를 만든다.',
    phrases:[{term:'sort it out',meaning_ko:'해결하다'},
             {term:"on the booking site's end",meaning_ko:'예약 사이트 쪽 문제로'},
             {term:'what I’d like to know is',meaning_ko:'내가 알고 싶은 건'},
             {term:"I'd really rather not",meaning_ko:'정말 그러고 싶지 않다'}] },
];

const html = readFileSync('./index.html', 'utf8');
const sb = createClient(html.match(/const SUPABASE_URL = '([^']+)'/)[1],
                        html.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1],
                        { auth:{ persistSession:false } });
const { data: auth, error: e0 } = await sb.auth.signInWithPassword({
  email: process.env.KTREE_EMAIL, password: process.env.KTREE_PASSWORD });
if (e0) { console.error('✗ 로그인 실패:', e0.message); process.exit(1); }

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const FILE = argv.find(a => !a.startsWith('--'));

let items = P;
if (FILE) {
  try { items = JSON.parse(readFileSync(FILE, 'utf8')); }
  catch (e) { console.error(`✗ ${FILE} 을 읽지 못했습니다: ${e.message}`); process.exit(1); }
  if (!Array.isArray(items)) { console.error('✗ JSON 최상위는 배열이어야 합니다'); process.exit(1); }
}

// topic 이 eng_topics 에 없으면 영영 안 뽑힌다 — 넣기 전에 막는다
const { data: tops } = await sb.from('eng_topics').select('name').eq('user_id', auth.user.id);
const known = new Set((tops || []).map(t => t.name));
const KINDS = new Set(['describe','habit','past','compare','ask','solve']);
const bad = [];
for (const [i, it] of items.entries()) {
  if (!KINDS.has(it.kind))          bad.push(`#${i} kind='${it.kind}' (describe·habit·past·compare·ask·solve 중 하나)`);
  else if (!it.question_en)         bad.push(`#${i} question_en 없음`);
  else if (known.size && !known.has(it.topic)) bad.push(`#${i} topic='${it.topic}' 가 eng_topics 에 없음 — 넣어도 안 뽑힙니다`);
}
if (bad.length) { console.error('✗ 넣지 않았습니다:\n  ' + bad.join('\n  ')); process.exit(1); }

const { data: have, error: e1 } = await sb.from('eng_prompts').select('question_en');
if (e1) { console.error('✗ eng_prompts 조회 실패 — english-v6-speaking.sql 을 먼저 실행하세요\n ', e1.message); process.exit(1); }
const seen = new Set((have || []).map(r => r.question_en));
const rows = items.filter(p => !seen.has(p.question_en)).map(p => ({ ...p, user_id: auth.user.id }));

const by = {};
items.forEach(p => by[p.kind] = (by[p.kind] || 0) + 1);
console.log(`${FILE || '(내장 시드)'}`);
console.log('유형 분포:', Object.entries(by).map(([k,v]) => `${k} ${v}`).join(' · '));
console.log(`전체 ${items.length}개 · 이미 있음 ${items.length - rows.length} · 넣을 것 ${rows.length}`);
if (DRY || !rows.length) { await sb.auth.signOut(); process.exit(0); }

const { error } = await sb.from('eng_prompts').insert(rows);
console.log(error ? `✗ ${error.message}` : `✓ ${rows.length}개 넣음`);
await sb.auth.signOut();
