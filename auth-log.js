/* 인증 계측 — 세션이 왜 풀렸는지 알아내기 위한 것.
 *
 * 증상: 몇십 분~몇 시간 안 쓰면 로그아웃돼 있고, 새로고침해도 복구되지 않는다.
 *
 * ── 2026-10-03 원인 확정 · 조치 완료 ──────────────────────────────
 * 프로젝트 인증 설정을 직접 읽은 것이 결정타였다:
 *   refresh_token_rotation_enabled        true   갱신 때마다 토큰 교체
 *   security_refresh_token_reuse_interval 10     옛 토큰 유예 10초
 *   sessions_timebox                      0      ← 시간 제한 없음
 *   sessions_inactivity_timeout           0      ← 유휴 만료 없음
 *
 * 🔴 뒤의 둘이 0이면 **세션이 시간으로 죽는 경로가 없다.** 그러면 남는 건
 *    ①명시적 로그아웃 ②재사용 감지 폐기 뿐이고, 로그아웃한 적이 없으므로 ②다.
 *    회전이 켜져 있으면 옛 토큰은 10초 뒤 죽고, 그 뒤 그걸 제시하는 소지자가 있으면
 *    Supabase 가 탈취로 보고 **세션 패밀리를 통째로 폐기**한다 (SIGNED_OUT 이 여러 창에서 동시에).
 *
 * → 2026-10-03 **회전을 껐다** (Management API: refresh_token_rotation_enabled=false).
 *   클라이언트로는 못 고친다 — 서버가 폐기하면 끝이다.
 *
 * 걸러낸 오답 둘 (다시 의심하지 말 것):
 *   · "탭이 여러 개라 타이머가 경쟁한다" → 아니다. supabase-js 는 _onVisibilityChanged 에서
 *     **숨은 탭의 자동 갱신을 스스로 끈다**.
 *   · "PWA 와 Safari 가 같은 세션을 공유해 충돌한다" → 아니다. 저장소가 다르면 각자 로그인했을
 *     테고 세션 자체가 별개라 충돌할 수 없다. 다만 **로그가 따로 쌓이는 것은 사실**이다.
 *
 * 그래서 이 계측은 이제 **재발 감시용**이다. 또 풀리면 보는 것:
 *   refresh-http 줄의 코드 — 400 refresh_token_already_used 면 회전이 다시 켜진 것이고,
 *   'network:' 로 시작하면 위 분기상 세션은 지워지지 않았어야 한다 (다른 원인이다).
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

  /* 🔴 저장은 ISO(UTC)로, 표시는 KST 로. 전에는 toISOString 을 그대로 잘라 보여줘서
     로그가 9시간 어긋나 보였고, "조치 전에 난 실패"를 "조치 후에도 난다"로 읽었다.
     앱의 다른 곳도 KST 고정이라(kstDate) 같은 규칙으로 맞춘다. */
  const kst = iso => {
    try { return new Date(new Date(iso).getTime() + 9 * 3600e3)
      .toISOString().slice(5, 19).replace('T', ' '); } catch { return iso; }
  };

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
      const head = `지금 이 창: ${CTX}/${MODE} · 컨텍스트 ${ctxs.length}개 · 시각은 KST` +
        (standalone ? '' : '\n⚠️ 홈 화면 앱(PWA)은 저장소가 따로라 여기 안 보인다 — 거기서도 따로 떠야 한다');
      const body = r.map(x => {
        const bits = [kst(x.t)];
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

    /* 🔴 로그아웃을 **부른 순간** 을 남긴다. SIGNED_OUT 만으로는 누가 눌러서 나간 건지
       토큰이 거절돼 쫓겨난 건지 구분이 안 된다. scope 도 같이 적는다 —
       인자를 빼고 부르면 supabase 기본이 'global' 이라 **다른 기기 세션까지 서버에서 지워진다.** */
    // 계측이 앱을 깨뜨리면 안 된다 — 감쌀 게 없으면 조용히 건너뛴다
    if (typeof sb.auth.signOut === 'function') {
      const origSignOut = sb.auth.signOut.bind(sb.auth);
      sb.auth.signOut = (opts) => {
        try { log({ e: 'signOut-호출',
          err: 'scope=' + (opts && opts.scope ? opts.scope : 'global(인자없음!)') }); } catch {}
        return origSignOut(opts);
      };
    }

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
