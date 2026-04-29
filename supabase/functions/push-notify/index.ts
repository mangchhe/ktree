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
  const key = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${unsigned}.${sigB64}`;
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await signVapid(audience);
  const authHeader = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

  const encryptedBody = await encryptPayload(payload, sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: encryptedBody,
  });
  return res.status;
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.json();
  const { record, type } = body;

  if (type !== 'INSERT' || !record) return new Response('ok', { status: 200 });

  const memberId = record.member_id;
  const activityType = record.activity_type;
  const attendedOn = record.attended_on;

  const { data: member } = await sb.from('challenge_members').select('name').eq('id', memberId).single();
  const memberName = member?.name || '팀원';
  const label = activityType === 'english' ? '영어' : '운동';
  const notifyPayload = JSON.stringify({
    title: `${memberName}님이 출석했어요!`,
    body: `${attendedOn} ${label} 완료 💪`,
    icon: '/icon.svg',
    url: '/challenge'
  });

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, member_id')
    .neq('member_id', memberId);

  if (!subs?.length) return new Response('no subscribers', { status: 200 });

  await Promise.allSettled(subs.map(s => sendPush(s, notifyPayload)));

  return new Response('sent', { status: 200 });
});
