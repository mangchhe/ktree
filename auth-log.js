/* 인증 계측 — 세션이 왜 풀렸는지 알아내기 위한 것.
 *
 * 증상: 몇십 분~몇 시간 안 쓰면 로그아웃돼 있고, 새로고침해도 복구되지 않는다.
 *
 * ── 2026-10-02 로그로 여기까지 좁혔다 ────────────────────────────
 * 12:02:17 SIGNED_IN  만료까지 1568초  →  만료 12:28:25
 * 12:11:18 SIGNED_IN  만료까지 1027초  →  만료 12:28:25   (같다 = 갱신이 한 번도 성공 안 했다)
 * 12:29:48 SIGNED_OUT 세션X                                (만료 83초 뒤)
 *
 * supabase-js 2.117 의 _callRefreshToken 은 실패를 이렇게 가른다:
 *   재시도 가능한 네트워크 오류  → 세션을 **지우지 않는다**
 *   그 외(서버가 거절)          → 저장된 access token 이 아직 살아 있으면 보존,
 *                                 **만료됐으면 _removeSession()** → SIGNED_OUT + 저장소 삭제
 * 우리 경우는 만료 83초 뒤였다. 그러므로 **네트워크 문제가 아니라 서버가 리프레시 토큰을
 * 거절한 것**이다. (refresh_token_already_used / not_found / session_expired 중 하나)
 *
 * 남은 질문 둘, 그리고 이 파일이 그걸 잡는다:
 *   ① 서버가 준 정확한 오류 코드  → fetch 를 감싸 토큰 엔드포인트 응답만 기록한다
 *   ② 같은 계정을 들고 있는 **다른 컨텍스트**가 있나 → 컨텍스트 id·표시 모드를 남긴다
 *      (iOS 홈 화면 PWA 와 Safari 탭은 **저장소가 따로**다. navigator.locks 도,
 *       supabase 의 커밋 가드도 그 둘 사이는 못 막는다. 한쪽이 회전시키면
 *       다른 쪽 토큰이 '이미 사용됨'이 되고 패밀리가 통째로 폐기된다.)
 *      ⚠️ PWA 와 Safari 는 로그도 따로 쌓인다. 둘 다에서 「진단」을 떠야 전체가 보인다.
 *
 * 🔴 깨어날 때 우리가 refreshSession() 을 직접 부르지 않는다 — 그게 바로 우리가 쫓는
 *    회전 충돌을 만들어낼 수 있다. 여기서는 **보기만** 한다.
 *
 * 토큰 값은 절대 남기지 않는다 — 있었는지와 만료 시각만.
 *
 *   authLog.dump()   콘솔에 표로
 *   authLog.text()   사람이 읽을 문자열 (로그인 화면의 「진단」이 이걸 쓴다)
 *   authLog.clear()  비우기
 */
(function () {
  const KEY = 'ktree-auth-log', MAX = 150;

  // 이 페이지 적재마다 다른 값. 어느 컨텍스트가 쓴 줄인지 가른다.
  const CTX = Math.random().toString(36).slice(2, 6);
  const standalone = (() => {
    try {
      return navigator.standalone === true ||
             (matchMedia && matchMedia('(display-mode: standalone)').matches);
    } catch { return false; }
  })();
  const MODE = standalone ? 'pwa' : 'web';

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = rows => { try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX))); } catch {} };
  const log = e => {
    const r = read();
    r.push({ t: new Date().toISOString(), p: location.pathname, c: CTX, m: MODE, ...e });
    write(r);
  };

  // 저장소에 세션이 남아 있는지만 본다. 토큰 값은 읽어도 기록하지 않는다.
  function stored() {
    try {
      const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
      if (!k) return null;
      const v = JSON.parse(localStorage.getItem(k));
      return v && v.refresh_token ? { exp: v.expires_at || null } : null;
    } catch { return null; }
  }

  /* ── ① 갱신 요청의 **서버 응답**을 가로채 기록한다 ──────────────
     이게 지금 로그에 없던 조각이다. SIGNED_OUT 은 "실패했다"만 말하고
     "왜"를 안 말한다. 응답은 복제해서 읽으므로 앱 쪽 흐름은 그대로다. */
  if (!window.__authLogFetch && typeof fetch === 'function') {
    window.__authLogFetch = true;
    const orig = window.fetch;
    window.fetch = function (input, init) {
      let url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch {}
      const isRefresh = /\/auth\/v1\/token\?/.test(url) && /grant_type=refresh_token/.test(url);
      const p = orig.apply(this, arguments);
      if (!isRefresh) return p;
      return p.then(res => {
        try {
          if (res.ok) { log({ e: 'refresh-http', err: 'ok ' + res.status }); return res; }
          res.clone().json().then(b => {
            // 코드·메시지만. 토큰은 응답 본문에 없고, 있어도 기록하지 않는다.
            const code = b && (b.error_code || b.error || b.msg || b.message) || '';
            log({ e: 'refresh-http', err: res.status + ' ' + String(code).slice(0, 80) });
          }).catch(() => log({ e: 'refresh-http', err: String(res.status) }));
        } catch {}
        return res;
      }, err => {
        // 여기로 오면 **네트워크 오류**다 — supabase 는 이 경우 세션을 안 지운다
        log({ e: 'refresh-http', err: 'network: ' + String(err && err.message || err).slice(0, 60) });
        throw err;
      });
    };
  }

  window.authLog = {
    read, log, ctx: CTX, mode: MODE,
    clear: () => { try { localStorage.removeItem(KEY); } catch {} },
    dump() { const r = read(); console.table(r); return r; },
    text() {
      const r = read();
      const ctxs = [...new Set(r.map(x => x.c).filter(Boolean))];
      // 🔴 비어 있어도 머리말은 낸다. **그때가 제일 중요하다** —
      //    로그아웃됐는데 기록이 없다면 다른 저장소(PWA↔Safari)를 보고 있다는 뜻이다.
      const head = `지금 이 창: ${CTX}/${MODE} · 이 기록에 담긴 컨텍스트 ${ctxs.length}개` +
        (standalone ? '' : '\n⚠️ 홈 화면 앱(PWA)은 저장소가 따로라 여기 안 보인다 — 거기서도 따로 떠야 한다');
      const body = r.map(x => {
        const bits = [x.t.slice(5, 19).replace('T', ' ')];
        bits.push(((x.c || '----') + '/' + (x.m || '?')));
        bits.push((x.p || '').replace(/^\//, '') || '/');
        bits.push(x.e);
        if (x.has !== undefined) bits.push(x.has ? '세션O' : '세션X');
        if (x.expIn !== undefined && x.expIn !== null) bits.push(`만료까지 ${x.expIn}초`);
        if (x.hidSec !== undefined) bits.push(`${x.hidSec}초 만에 깸`);
        if (x.vis) bits.push(x.vis);
        if (x.err) bits.push('⚠ ' + x.err);
        return bits.join(' · ');
      }).join('\n');
      return head + '\n\n' + (r.length ? body : '(이 저장소에는 기록 없음)');
    },
  };

  /** 클라이언트를 만든 직후에 부른다. */
  window.attachAuthLog = async function (sb) {
    if (!sb || !sb.auth) return;
    const had = stored();
    log({ e: 'open', has: !!had, vis: document.visibilityState });

    sb.auth.onAuthStateChange((event, session) => {
      const exp = session?.expires_at;
      log({ e: event, has: !!session,
            expIn: exp ? Math.round((exp * 1000 - Date.now()) / 1000) : null,
            vis: document.visibilityState });
    });

    /* ── 깨어날 때 한 줄. 얼마나 자고 일어났는지가 중요하다 —
          타이머가 얼어 있던 구간이 그만큼이다. **보기만 하고 갱신은 안 건다.** */
    let hidAt = document.visibilityState === 'hidden' ? Date.now() : 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hidAt = Date.now(); return; }
      const s = stored();
      log({ e: 'wake', has: !!s, hidSec: hidAt ? Math.round((Date.now() - hidAt) / 1000) : 0,
            expIn: s && s.exp ? Math.round((s.exp * 1000 - Date.now()) / 1000) : null });
      hidAt = 0;
    });

    // 저장소엔 세션이 있는데 getSession 이 비면 **서버가 폐기한 것**이다.
    // 그 자리에서 한 번 갱신을 시도해 서버가 주는 이유를 남긴다.
    // 이미 죽은 세션에만 실행하므로 멀쩡한 세션을 건드릴 일은 없다.
    // (이제 fetch 가로채기가 같은 요청의 HTTP 응답도 같이 남긴다.)
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (had && !session) {
        const { error } = await sb.auth.refreshSession();
        log({ e: 'refresh-probe', err: error ? error.message : '(예상 밖) 갱신 성공' });
      }
    } catch (e) { log({ e: 'probe-throw', err: String(e && e.message || e) }); }
  };
})();
