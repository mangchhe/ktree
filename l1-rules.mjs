/**
 * S1 답(model_l1) 규칙 — 손으로 쓴 것(backfill-l1.mjs)과 밤 보급이 만든 것(seed-prompts.mjs)에
 * **같은 잣대**를 건다. 왜: NH 는 문장을 이어 붙이지 못하는 단계라, 문장 하나가 길거나
 * IM 이상 표현이 하나만 섞여도 따라 말하기에서 입이 멈춘다 (실측: 3초·10초).
 */
export const L1_MAX_WORDS = 13;
export const L1_SENTENCES = [3, 6];
// IM 이상에서나 쓰는 것들. 하나라도 있으면 S1 답이 아니다.
const HARD = /\b(actually|honestly|basically|whereas|although|though|whom|whose|end(ed)? up|tend to|used to|would have|had been|have been|has been|sort of|what I like most)\b/i;
// 모양은 같은데 S1 인 것과 아닌 것이 갈리는 둘:
//   which — 문장 첫머리면 의문사(Which city did you visit?, S1), 가운데면 관계대명사(IM)
//   kind of — "what kind of" 는 기본, 그냥 "kind of tired" 는 얼버무림(IM)
const midWhich = s => /\bwhich\b/i.test(s.split(/\s+/).slice(1).join(' '));
const hedgeKind = s => /(?<!what )\bkind of\b/i.test(s);

// 쪼개는 규칙은 앱(english.html)의 sentences 와 같다 — 따라 말하기는 이 단위로 들려준다.
const sentences = t => (String(t || '').match(/[^.!?]+[.!?]*/g) || []).map(x => x.trim()).filter(Boolean);

export function checkL1(text){
  const out = [];
  const ss = sentences(text);
  if (ss.length < L1_SENTENCES[0] || ss.length > L1_SENTENCES[1])
    out.push(`문장 ${ss.length}개 (${L1_SENTENCES.join('~')}개여야 한다)`);
  for (const s of ss) {
    const w = s.split(/\s+/).length;
    if (w > L1_MAX_WORDS) out.push(`"${s.slice(0, 40)}…" ${w}단어 (${L1_MAX_WORDS} 이하)`);
    if (midWhich(s)) out.push(`"${s.slice(0, 40)}…" — 관계대명사 which (IM)`);
    if (hedgeKind(s)) out.push(`"${s.slice(0, 40)}…" — 얼버무리는 kind of (IM)`);
  }
  const h = String(text || '').match(HARD);
  if (h) out.push(`"${h[0]}" — IM 이상 표현`);
  return out;
}
