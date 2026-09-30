/* 인증 계측 — 세션이 왜 풀렸는지 다음에 알아내기 위한 것.
 *
 * 증상: 몇십 분~몇 시간 안 쓰면 로그아웃돼 있고, 새로고침해도 복구되지 않는다.
 * 새로고침이 안 먹는다 = 리프레시 토큰이 서버에서 폐기됐다는 뜻이다. 유력한 용의자는
 * **리프레시 토큰 회전 충돌** — 한 오리진에 앱이 여럿(ktree·admin·english·challenge)이라,
 * 백그라운드에서 잠들었던 페이지가 낡은 토큰을 들고 깨어나면 재사용으로 감지돼
 * 세션 패밀리가 통째로 폐기된다. navigator.locks 는 살아있는 탭끼리만 막아준다.
 *
 * 그래서 추측 대신 기록한다. 토큰 값은 절대 남기지 않는다 — 있었는지와 만료 시각만.
 *
 *   authLog.dump()   콘솔에 표로
 *   authLog.text()   사람이 읽을 문자열 (로그인 화면의 「진단」이 이걸 쓴다)
 *   authLog.clear()  비우기
 */
(function () {
  const KEY = 'ktree-auth-log', MAX = 80;

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = rows => { try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX))); } catch {} };
  const log = e => { const r = read(); r.push({ t: new Date().toISOString(), p: location.pathname, ...e }); write(r); };

  // 저장소에 세션이 남아 있는지만 본다. 토큰 값은 읽어도 기록하지 않는다.
  function stored() {
    try {
      const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
      if (!k) return null;
      const v = JSON.parse(localStorage.getItem(k));
      return v && v.refresh_token ? { exp: v.expires_at || null } : null;
    } catch { return null; }
  }

  window.authLog = {
    read, log, clear: () => { try { localStorage.removeItem(KEY); } catch {} },
    dump() { const r = read(); console.table(r); return r; },
    text() {
      const r = read();
      if (!r.length) return '기록 없음';
      return r.map(x => {
        const bits = [x.t.slice(5, 19).replace('T', ' '), (x.p || '').replace(/^\//, '') || '/', x.e];
        if (x.has !== undefined) bits.push(x.has ? '세션O' : '세션X');
        if (x.expIn !== undefined && x.expIn !== null) bits.push(`만료까지 ${x.expIn}초`);
        if (x.vis) bits.push(x.vis);
        if (x.err) bits.push('⚠ ' + x.err);
        return bits.join(' · ');
      }).join('\n');
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

    // 저장소엔 세션이 있는데 getSession 이 비면 **서버가 폐기한 것**이다.
    // 그 자리에서 한 번 갱신을 시도해 서버가 주는 이유를 남긴다
    // (예: "Invalid Refresh Token: Already Used" → 회전 충돌이 확정된다).
    // 이미 죽은 세션에만 실행하므로 멀쩡한 세션을 건드릴 일은 없다.
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (had && !session) {
        const { error } = await sb.auth.refreshSession();
        log({ e: 'refresh-probe', err: error ? error.message : '(예상 밖) 갱신 성공' });
      }
    } catch (e) { log({ e: 'probe-throw', err: String(e && e.message || e) }); }
  };
})();
