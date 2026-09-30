// ⚠️ english.html 의 BUILD 와 **같은 값**이어야 한다 — bump-version.sh 가 둘을 같이 갱신한다.
// 이 이름이 바뀌면 activate 훅이 옛 캐시를 지우므로, 배포마다 바꿔야 오프라인 캐시가 안 굳는다.
const CACHE = 'ktree-2026-09-30.9';
const STATIC = [
  '/challenge',
  '/challenge-history',
  '/english',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || '챌린지', {
      body: data.body || '',
      icon: data.icon || '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/challenge' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/challenge';
  // 푸시가 가리키는 페이지(/challenge, /english …)가 이미 열려 있으면 그 탭을 재사용한다
  const path = new URL(url, self.location.origin).pathname.replace(/\.html$/, '');
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => new URL(c.url).pathname.replace(/\.html$/, '') === path);
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
