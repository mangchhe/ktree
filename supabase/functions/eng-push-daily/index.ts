// eng-push-daily — 매일 아침 "오늘 복습 N장" 푸시.
// pg_cron(+pg_net) 또는 외부 크론이 POST 로 호출한다. VAPID 서명·암호화는 push-notify 와 동일.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = 'BBiS1fxusb6K-H4FKXd8QqGsJYj5AQjogJQSToIuCRFNtueunqsuqNMizF02etbN0dYIKgsCDaMsvG0Kt2m4WII';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = 'mailto:admin@challenge.app';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function signVapid(audience: string) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 43200, sub: VAPID_SUBJECT };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const keyData = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${unsigned}.${sigB64}`;
}

async function encryptPayload(payload: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const p256dh = Uint8Array.from(atob(p256dhB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const authBytes = Uint8Array.from(atob(authB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const plaintext = new TextEncoder().encode(payload);
  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const clientKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey as CryptoKey, 256);
  const serverPubRaw = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey as CryptoKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdf(authBytes, new Uint8Array(sharedBits), new TextEncoder().encode('WebPush: info\x00').buffer as ArrayBuffer, p256dh, new Uint8Array(serverPubRaw));
  const cek = await hkdfExpand(prk, salt, 'Content-Encoding: aes128gcm\x00', 16);
  const nonce = await hkdfExpand(prk, salt, 'Content-Encoding: nonce\x00', 12);
  const gcmKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, gcmKey, new Uint8Array([...plaintext, 2]));
  const rs = 4096;
  const header = new Uint8Array(21 + serverPubRaw.byteLength);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = serverPubRaw.byteLength;
  header.set(new Uint8Array(serverPubRaw), 21);
  const result = new Uint8Array(header.byteLength + encrypted.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(encrypted), header.byteLength);
  return result;
}

async function hkdf(salt: Uint8Array, ikm: ArrayBuffer, info: ArrayBuffer, ...extra: Uint8Array[]): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const infoArr = new Uint8Array([...new Uint8Array(info), ...extra.flatMap(e => [...e])]);
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: infoArr }, key, 256);
}

async function hkdfExpand(prk: ArrayBuffer, salt: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HKDF' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
    key, length * 8
  );
  return new Uint8Array(bits);
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const url = new URL(sub.endpoint);
  const jwt = await signVapid(`${url.protocol}//${url.host}`);
  const body = await encryptPayload(payload, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });
  return res.status;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // KST 기준 오늘 — next_review 는 date 컬럼이라 문자열 비교로 충분하다
  const todayKst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  // due 카드가 있는 사용자별 집계
  // status 도 같이 받는다. 스키마가 next_review 를 current_date 로 채우므로
  // next_review <= 오늘 에는 **신규 카드가 전부 포함된다** — 합쳐 세면 백로그 총량이
  // "오늘 복습 N장"으로 나가서 보급할수록 숫자가 커지고 문구가 거짓이 된다 (앱 홈과 같은 규칙).
  const { data: rows, error } = await sb
    .from('eng_cards')
    .select('user_id, status')
    .lte('next_review', todayKst)
    .neq('status', 'suspended');
  if (error) return new Response(error.message, { status: 500 });

  const counts = new Map<string, { due: number; fresh: number }>();
  for (const row of rows ?? []) {
    const c = counts.get(row.user_id) ?? { due: 0, fresh: 0 };
    if (row.status === 'new') c.fresh++; else c.due++;
    counts.set(row.user_id, c);
  }
  if (!counts.size) return new Response('no due cards', { status: 200 });

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', [...counts.keys()]);
  if (!subs?.length) return new Response('no subscribers', { status: 200 });

  let sent = 0;
  const dead: string[] = [];
  await Promise.allSettled(subs.map(async (s) => {
    const { due: d, fresh: f } = counts.get(s.user_id)!;
    // 복습이 있으면 그걸 앞세운다. 복습이 0이고 신규만 있는 날은 "복습 0장"이 아니라 새 카드를 말한다.
    const title = d > 0 ? `오늘 복습 ${d}장 🗣️` : `새 카드 ${f}장 기다려요 🗣️`;
    const body = d > 0 && f > 0
      ? `새 카드도 ${f}장 있어요 — 출근길에 몇 분이면 됩니다.`
      : '출근길에 몇 분이면 끝나요 — 큐가 기다리고 있어요.';
    const payload = JSON.stringify({ title, body, icon: '/icon.svg', url: '/english' });
    const status = await sendPush(s, payload);
    if (status === 404 || status === 410) dead.push(s.endpoint);
    else if (status < 300) sent++;
  }));

  // 만료된 구독은 정리한다 — 안 지우면 매일 죽은 엔드포인트에 쏜다
  if (dead.length) await sb.from('push_subscriptions').delete().in('endpoint', dead);

  return new Response(`sent ${sent}, cleaned ${dead.length}`, { status: 200 });
});
