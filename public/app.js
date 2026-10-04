/* HEARTDRIVE — client */
(() => {
  'use strict';

  // =========================================================
  // UTILITAIRES
  // =========================================================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };
  const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = t => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtRel = t => (new Date(t).toDateString() === new Date().toDateString() ? fmtTime(t) : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
  const initial = p => esc((p || '?').trim().charAt(0).toUpperCase());
  const COLORS = ['#00e5ff', '#ff2fd6', '#39ff14', '#ffb400', '#7b5cff', '#ff5a36', '#2fd4ff', '#ff4f8b', '#f0c968', '#b5e655'];

  async function api(path, opts = {}) {
    const o = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
    if (opts.body instanceof FormData) o.body = opts.body;
    else if (opts.body) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(path, o);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !['/api/login', '/api/register', '/api/me/pin'].includes(path)) { state.me = null; go('#/login'); throw new Error('Non connecté'); }
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  }

  function toast(html, cls = '', onclick) {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = html;
    t.onclick = () => { t.remove(); onclick && onclick(); };
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  function avatar(user, size = '', withDot = false) {
    if (!user) return '';
    const inner = user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : initial(user.pseudo);
    return `<div class="avatar ${size}" style="--c:${esc(user.color)}">${inner}${withDot ? `<span class="dot ${user.online ? 'on' : ''}" data-presence="${user.id}"></span>` : ''}</div>`;
  }
  const linkName = l => l.label || l.other.pseudo;
  const preview = m => !m ? 'Aucun message pour l’instant' : m.kind === 'voice' ? '🎙️ Message vocal' : m.kind === 'photo' ? '📷 Photo' : esc(m.body);

  // ---------- Modales ----------
  function modal(html, onMount) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="frame modal">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
    onMount && onMount(bg, close);
    return close;
  }
  const confirmModal = (title, text, ok = 'Confirmer', danger = false) => new Promise(resolve => {
    modal(`<h3>${title}</h3><p>${text}</p><div class="acts"><button class="btn-ghost" data-no>Annuler</button><button class="btn sm ${danger ? 'red' : 'green'}" data-yes>${ok}</button></div>`, (bg, close) => {
      $('[data-no]', bg).onclick = () => { close(); resolve(false); };
      $('[data-yes]', bg).onclick = () => { close(); resolve(true); };
    });
  });
  const promptModal = (title, value = '', placeholder = '', hint = '') => new Promise(resolve => {
    modal(`<h3>${title}</h3><form><input class="input" maxlength="40" value="${esc(value)}" placeholder="${esc(placeholder)}">${hint ? `<p class="muted small">${hint}</p>` : ''}
      <div class="acts"><button type="button" class="btn-ghost" data-no>Annuler</button><button class="btn sm green">Enregistrer</button></div></form>`, (bg, close) => {
      const inp = $('input', bg); inp.focus(); inp.select();
      $('[data-no]', bg).onclick = () => { close(); resolve(null); };
      $('form', bg).onsubmit = e => { e.preventDefault(); close(); resolve(inp.value.trim()); };
    });
  });

  // ---------- Menu contextuel ----------
  function openMenu(btn, items) {
    $$('.menu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''} ${it.label}</button>`).join('');
    btn.parentElement.appendChild(m);
    $$('button', m).forEach(b => b.onclick = e => { e.stopPropagation(); m.remove(); items[b.dataset.i].onClick(); });
    setTimeout(() => document.addEventListener('click', function off() { m.remove(); document.removeEventListener('click', off); }), 0);
  }

  // ---------- Images ----------
  // Redimensionne (et recadre en carré si demandé) avant l'envoi
  function processImage(file, max = 1600, square = false) {
    return new Promise(resolve => {
      if (!/^image\/(jpeg|png|webp)/.test(file.type)) return resolve(file);
      const img = new Image();
      img.onload = () => {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
        const k = Math.min(1, max / Math.max(sw, sh));
        const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b || file), 'image/jpeg', 0.86);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }
  function pickFile(accept = 'image/*', capture) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept;
      if (capture) inp.setAttribute('capture', capture);
      inp.onchange = () => resolve(inp.files[0] || null);
      inp.click();
    });
  }

  // Appareil photo intégré (getUserMedia), avec repli sur l'appareil natif
  function openCamera(facing = 'environment') {
    return new Promise(async resolve => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return resolve(await pickFile('image/*', facing));
      let stream, mode = facing;
      const el = document.createElement('div');
      el.className = 'cam';
      el.innerHTML = `<video playsinline autoplay muted></video>
        <div class="ctrl"><button class="iconbtn" data-x title="Fermer">✖</button><button class="shutter" data-shot title="Prendre la photo"></button><button class="iconbtn" data-flip title="Changer de caméra">🔄</button></div>`;
      document.body.appendChild(el);
      const video = $('video', el);
      const stop = () => stream && stream.getTracks().forEach(t => t.stop());
      const done = v => { stop(); el.remove(); resolve(v); };
      async function startStream() {
        stop();
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
          video.srcObject = stream;
          video.classList.toggle('mirror', mode === 'user');
        } catch {
          el.remove(); resolve(await pickFile('image/*', facing));
        }
      }
      $('[data-x]', el).onclick = () => done(null);
      $('[data-flip]', el).onclick = () => { mode = mode === 'user' ? 'environment' : 'user'; startStream(); };
      $('[data-shot]', el).onclick = () => {
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        const ctx = c.getContext('2d');
        if (mode === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0);
        c.toBlob(blob => {
          stop();
          const url = URL.createObjectURL(blob);
          el.innerHTML = `<img class="shot" src="${url}" alt=""><div class="ctrl"><button class="btn-ghost" data-retake>↺ Reprendre</button><button class="btn green" data-ok>Utiliser ✓</button></div>`;
          $('[data-retake]', el).onclick = () => { el.remove(); URL.revokeObjectURL(url); openCamera(mode).then(resolve); };
          $('[data-ok]', el).onclick = () => { el.remove(); URL.revokeObjectURL(url); resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' })); };
        }, 'image/jpeg', 0.9);
      };
      startStream();
    });
  }

  // =========================================================
  // ÉTAT GLOBAL, NAVIGATION, TEMPS RÉEL
  // =========================================================
  const state = { me: null, themes: {}, socket: null, links: [], route: '', params: {}, typingTimer: null };
  const go = h => { if (location.hash === h) render(); else location.hash = h; };

  async function refreshLinks() {
    try { state.links = await api('/api/links'); } catch { return; }
    updateBadges();
  }
  function updateBadges() {
    const total = state.links.filter(l => l.status === 'active').reduce((s, l) => s + (l.unread || 0), 0);
    $$('[data-badge="msgs"]').forEach(b => { b.textContent = total; b.hidden = !total; });
    state.links.forEach(l => $$(`[data-unread="${l.id}"]`).forEach(b => { b.textContent = l.unread; b.hidden = !l.unread; }));
    document.title = (total ? `(${total}) ` : '') + 'HEARTDRIVE';
  }

  function renderShell() {
    const tb = $('#topbar'), bn = $('#bottomnav');
    if (!state.me) { tb.hidden = true; bn.hidden = true; return; }
    tb.hidden = false; bn.hidden = false;
    const r = state.route, sec = state.params.section || 'links';
    const on = (route, s) => (r === route && (!s || sec === s) ? 'on' : '');
    tb.innerHTML = `
      <a class="logo" href="#/">HEART<b>DRIVE</b></a>
      <nav class="topnav">
        <a class="navlink ${on('home', 'links')}" href="#/">Links</a>
        <a class="navlink ${on('home', 'messages')}" href="#/home/messages">Messagerie<span class="nbadge" data-badge="msgs" hidden></span></a>
        <a class="navlink ${on('home', 'history') || on('history')}" href="#/home/history">Historique</a>
        <a class="me-btn ${on('profile')}" href="#/profile">${avatar(state.me, 'xs')} ${esc(state.me.pseudo)}</a>
      </nav>`;
    bn.innerHTML = `
      <a class="${on('home', 'links') || on('link')}" href="#/"><span class="ico">🔗</span>Links</a>
      <a class="${on('home', 'messages')}" href="#/home/messages"><span class="ico">💬</span>Messages<span class="nbadge" data-badge="msgs" hidden></span></a>
      <a class="${on('home', 'history') || on('history') || on('report')}" href="#/home/history"><span class="ico">📜</span>Historique</a>
      <a class="${on('profile')}" href="#/profile"><span class="ico">👤</span>Profil</a>`;
    updateBadges();
  }

  function connectSocket() {
    if (state.socket) state.socket.disconnect();
    const s = io({ withCredentials: true });
    state.socket = s;
    s.on('links', async () => {
      await refreshLinks();
      if (state.route === 'home' && !isTyping()) renderHome(true);
      if (state.route === 'link' && state.params.tab !== 'chat' && !isTyping()) renderLink(true);
    });
    s.on('game', async ({ gameId, linkId }) => {
      if (state.route === 'game' && state.params.id == gameId) return renderGame(true);
      if (state.route === 'link' && state.params.id == linkId && state.params.tab !== 'chat') return renderLink(true);
      if (state.route === 'home' && !isTyping()) { await refreshLinks(); renderHome(true); }
    });
    s.on('message', async m => {
      if (chat.isOpen(m.linkId)) chat.add(m);
      if (m.sender === state.me.id) return;
      await refreshLinks();
      if (chat.isOpen(m.linkId) && chat.isVisible()) return;
      const l = state.links.find(x => x.id === m.linkId);
      toast(`${l ? avatar(l.other, 'xs') : ''}<div><b>${esc(l ? linkName(l) : 'Nouveau message')}</b><br>${preview(m)}</div>`, 'pink', () => go(`#/link/${m.linkId}/chat`));
      if (state.route === 'home' && !isTyping()) renderHome(true);
    });
    s.on('presence', ({ userId, online }) => {
      $$(`[data-presence="${userId}"]`).forEach(d => d.classList.toggle('on', online));
      state.links.forEach(l => { if (l.other.id === userId) l.other.online = online; });
    });
    s.on('typing', ({ linkId }) => {
      const el = $('#typing');
      if (!el || !chat.isOpen(linkId)) return;
      el.textContent = 'est en train d’écrire…';
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => { el.textContent = ''; }, 2500);
    });
  }
  const isTyping = () => { const a = document.activeElement; return a && app.contains(a) && /INPUT|TEXTAREA/.test(a.tagName) && a.value; };

  // ---------- Routeur ----------
  async function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    let route = parts[0] || 'home';
    state.route = route;
    state.params = {};
    if (!state.me && route !== 'login') {
      try { state.me = await api('/api/me'); connectSocket(); await refreshLinks(); } catch { return go('#/login'); }
    }
    if (state.me && route === 'login') return go('#/');
    if (!Object.keys(state.themes).length) state.themes = await fetch('/api/themes').then(r => r.json());
    chat.stop();
    delete app.dataset.game;
    state.openGameChat = null;
    $$('.scrim').forEach(x => x.remove());
    try {
      if (route === 'login') { renderShell(); return renderAuth(); }
      if (route === 'home') state.params = { section: parts[1] || 'links' };
      if (route === 'link') state.params = { id: parts[1], tab: parts[2] || 'play' };
      if (['game', 'report'].includes(route)) state.params = { id: parts[1] };
      renderShell();
      if (route === 'link') return await renderLink();
      if (route === 'game') return await renderGame();
      if (route === 'report') return await renderReport();
      if (route === 'history') return await renderHistory();
      if (route === 'profile') return await renderProfile();
      state.route = 'home';
      return await renderHome();
    } catch (e) {
      app.innerHTML = `<div class="frame center page"><h3>Sortie de route 💥</h3><p>${esc(e.message)}</p><a class="btn sm" href="#/">Retour aux Links</a></div>`;
    }
  }
  window.addEventListener('hashchange', render);

  // =========================================================
  // CONNEXION / INSCRIPTION
  // =========================================================
  function renderAuth() {
    const last = store.get('hd_last_pseudo', '');
    let mode = last ? 'login' : 'register';
    const draw = () => {
      const reg = mode === 'register';
      app.innerHTML = `
      <div class="auth page">
        <div class="auth-hero">
          <div class="big">HEART<b>DRIVE</b></div>
          <div class="tag">FAIRE CONNAISSANCE · À FOND</div>
          <div class="steps">
            <div class="step"><span class="n">1</span><div><b>Crée ton pilote</b><span>Un pseudo et un code secret, c’est tout.</span></div></div>
            <div class="step"><span class="n">2</span><div><b>Lie-toi à ton binôme</b><span>Entre son pseudo : elle/il accepte, le lien est créé.</span></div></div>
            <div class="step"><span class="n">3</span><div><b>Répondez, comparez, discutez</b><span>Questions synchronisées, images, rapport et messagerie.</span></div></div>
          </div>
        </div>
        <form class="frame auth-card" id="authForm" novalidate>
          <div class="seg ${reg ? 'right' : ''}"><span class="thumb"></span>
            <button type="button" class="${reg ? '' : 'on'}" data-m="login">Connexion</button>
            <button type="button" class="${reg ? 'on' : ''}" data-m="register">Nouveau pilote</button>
          </div>
          <h3>${reg ? 'Bienvenue sur la grille 🏁' : 'Content de te revoir 👋'}</h3>
          <p class="lead">${reg ? 'Crée ton compte en 10 secondes. Ton binôme pourra te trouver grâce à ton pseudo.' : 'Entre ton pseudo et ton code secret pour reprendre la course.'}</p>
          <label class="field"><span>Pseudo</span>
            <input class="input" name="pseudo" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" value="${esc(reg ? '' : last)}" placeholder="ex : Axel">
            ${reg ? '<small>2 à 20 caractères. C’est ce pseudo que tu donneras à ton binôme.</small>' : ''}</label>
          <label class="field"><span>Code secret</span>
            <div class="pinwrap"><input class="input" name="pin" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="••••"><button type="button" data-eye title="Afficher / masquer">👁️</button></div>
            ${reg ? '<small>Au moins 4 caractères. Garde-le précieusement : il te servira à te reconnecter.</small>' : ''}</label>
          <button class="btn green big block mt" type="submit">${reg ? 'CRÉER MON PILOTE' : 'JOUER'}</button>
          <p class="error center" id="authErr" role="alert"></p>
          <div class="auth-switch">${reg ? 'Déjà un compte ? <button type="button" data-m="login">Se connecter</button>' : 'Pas encore de compte ? <button type="button" data-m="register">Créer un pilote</button>'}</div>
        </form>
      </div>`;
      $$('[data-m]').forEach(b => b.onclick = () => { if (mode !== b.dataset.m) { mode = b.dataset.m; draw(); } });
      $('[data-eye]').onclick = () => { const p = $('input[name=pin]'); p.type = p.type === 'password' ? 'text' : 'password'; p.focus(); };
      const form = $('#authForm');
      form.onsubmit = async e => {
        e.preventDefault();
        const pseudo = form.pseudo.value.trim(), pin = form.pin.value;
        const err = msg => { $('#authErr').textContent = msg; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); };
        if (pseudo.length < 2) return err('Entre un pseudo (2 caractères minimum).');
        if (pin.length < 4) return err('Le code secret fait au moins 4 caractères.');
        const btn = $('button[type=submit]', form);
        btn.classList.add('loading');
        try {
          state.me = await api(reg ? '/api/register' : '/api/login', { body: { pseudo, pin } });
          store.set('hd_last_pseudo', state.me.pseudo);
          connectSocket();
          await refreshLinks();
          go('#/');
        } catch (ex) { btn.classList.remove('loading'); err(ex.message); }
      };
      (form.pseudo.value ? form.pin : form.pseudo).focus();
    };
    draw();
  }

  // =========================================================
  // ACCUEIL : Links · Messagerie · Historique
  // =========================================================
  const secHead = (n, title, cls = '', extra = '') => `<div class="sec-head ${cls}"><span class="num">${n}</span><h2>${title}</h2><span class="line"></span>${extra}</div>`;

  async function renderHome(soft = false) {
    const [history] = await Promise.all([api('/api/history'), soft ? null : refreshLinks()]);
    const links = state.links;
    const incoming = links.filter(l => l.incoming);
    const outgoing = links.filter(l => l.status === 'pending' && !l.incoming);
    const active = links.filter(l => l.status === 'active');
    const convs = [...active].sort((a, b) => ((b.lastMsg && b.lastMsg.created_at) || b.activated_at) - ((a.lastMsg && a.lastMsg.created_at) || a.activated_at));
    const scrollY = window.scrollY;

    app.innerHTML = `<div class="page">
      <section class="sec" id="sec-links">
        ${secHead('01', 'Links')}
        <div class="links-top">
          <form class="frame" id="linkForm">
            <h3>⚔️ Défier un pilote</h3>
            <p class="muted small" style="margin-top:-6px">Entre le pseudo de la personne que tu veux découvrir.</p>
            <div class="inline-form"><input class="input" name="pseudo" placeholder="Pseudo de ton binôme" maxlength="20" autocapitalize="off" spellcheck="false" required><button class="btn green" type="submit">Lier</button></div>
            <p class="error" id="linkErr"></p>
          </form>
          <div class="frame stone">
            <h3>📨 Invitations ${incoming.length ? `<span class="unread">${incoming.length}</span>` : ''}</h3>
            ${incoming.map(l => `
              <div class="invite">${avatar(l.other, 'sm', true)}
                <div class="ellipsis" style="flex:1"><b>${esc(l.other.pseudo)}</b><div class="muted small">veut créer un lien avec toi</div></div>
                <button class="btn sm green" data-accept="${l.id}">Accepter</button><button class="iconbtn sm flat" data-decline="${l.id}" title="Refuser">✖</button>
              </div>`).join('')}
            ${outgoing.map(l => `
              <div class="invite">${avatar(l.other, 'sm')}
                <div class="ellipsis" style="flex:1"><b>${esc(l.other.pseudo)}</b><div class="muted small">en attente de sa réponse…</div></div>
                <button class="btn-ghost" data-decline="${l.id}">Annuler</button>
              </div>`).join('')}
            ${!incoming.length && !outgoing.length ? '<div class="empty">Aucune invitation en attente.</div>' : ''}
          </div>
        </div>
        <div class="lcards">
          ${active.map(l => `
            <div class="lcard" data-open="${l.id}">
              ${avatar(l.other, 'lg', true)}
              <div class="ellipsis">
                <div class="name ellipsis">${esc(linkName(l))}</div>
                ${l.label ? `<div class="handle">@${esc(l.other.pseudo)}</div>` : ''}
                <div class="meta">${l.activeGame ? '<span class="badge pulse">Course en cours</span>' : ''}<span>${l.gamesCount} course${l.gamesCount > 1 ? 's' : ''}</span></div>
              </div>
              <div class="acts">
                <a class="iconbtn sm flat" href="#/link/${l.id}/chat" title="Messagerie">💬<span class="nbadge" data-unread="${l.id}" ${l.unread ? '' : 'hidden'}>${l.unread}</span></a>
                <div class="menu-wrap"><button class="iconbtn sm flat" data-menu="${l.id}" title="Options">⋯</button></div>
              </div>
              <div class="play">${l.activeGame
                ? `<a class="btn green" href="#/game/${l.activeGame.id}">▶ Reprendre la course</a>`
                : `<a class="btn" href="#/link/${l.id}/play">🏁 Nouvelle course</a>`}</div>
            </div>`).join('') || '<div class="empty">Pas encore de lien actif. Défie quelqu’un juste au-dessus !</div>'}
        </div>
      </section>

      <section class="sec" id="sec-messages">
        ${secHead('02', 'Messagerie', 'pink')}
        ${convs.length ? `<div class="glass convs">${convs.map(l => `
          <a class="conv ${l.unread ? 'unread-row' : ''}" href="#/link/${l.id}/chat">
            ${avatar(l.other, '', true)}
            <div class="ellipsis"><div class="who ellipsis">${esc(linkName(l))}</div><div class="prev ellipsis">${l.lastMsg && l.lastMsg.sender_id === state.me.id ? 'Toi : ' : ''}${preview(l.lastMsg)}</div></div>
            <div class="side">${l.lastMsg ? fmtRel(l.lastMsg.created_at) : ''}<span class="unread" data-unread="${l.id}" ${l.unread ? '' : 'hidden'}>${l.unread}</span></div>
          </a>`).join('')}</div>` : '<div class="empty">Les conversations apparaîtront ici dès qu’un lien sera actif.</div>'}
      </section>

      <section class="sec" id="sec-history">
        ${secHead('03', 'Historique', 'amber', history.length > 6 ? '<a class="btn-neon sm" href="#/history"><span>Tout voir</span></a>' : '')}
        ${history.length ? `<div class="glass hrows">${history.slice(0, 6).map(historyRow).join('')}</div>` : '<div class="empty">Aucune partie jouée pour l’instant.</div>'}
      </section>
    </div>`;

    // Actions
    $('#linkForm').onsubmit = async e => {
      e.preventDefault();
      const inp = e.target.pseudo;
      try {
        const l = await api('/api/links', { body: { pseudo: inp.value } });
        inp.value = '';
        await refreshLinks();
        if (l.status === 'active') { toast(`<b>Lien activé avec ${esc(l.other.pseudo)} !</b>`); go(`#/link/${l.id}`); }
        else { toast(`Invitation envoyée à <b>${esc(l.other.pseudo)}</b>`); renderHome(true); }
      } catch (err) { $('#linkErr').textContent = err.message; }
    };
    $$('[data-accept]').forEach(b => b.onclick = async () => { const l = await api(`/api/links/${b.dataset.accept}/accept`, { method: 'POST' }); await refreshLinks(); go(`#/link/${l.id}`); });
    $$('[data-decline]').forEach(b => b.onclick = async () => { await api(`/api/links/${b.dataset.decline}/decline`, { method: 'POST' }); await refreshLinks(); renderHome(true); });
    $$('[data-open]').forEach(c => c.onclick = e => { if (!e.target.closest('a,button')) go(`#/link/${c.dataset.open}/play`); });
    $$('[data-menu]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const l = active.find(x => x.id == b.dataset.menu);
      openMenu(b, [
        { icon: '✏️', label: 'Renommer le lien', onClick: () => renameLink(l, () => renderHome(true)) },
        { icon: '📜', label: 'Voir les parties', onClick: () => go(`#/link/${l.id}/games`) },
        { icon: '💔', label: 'Rompre le lien', danger: true, onClick: () => endLink(l) },
      ]);
    });

    if (soft) window.scrollTo(0, scrollY);
    else if (state.params.section && state.params.section !== 'links') { const t = $('#sec-' + state.params.section); t && t.scrollIntoView({ block: 'start' }); }
    else window.scrollTo(0, 0);
  }

  function historyRow(g) {
    const href = g.status === 'active' ? `#/game/${g.id}` : g.score && g.score.completed ? `#/report/${g.id}` : `#/game/${g.id}`;
    const st = g.status === 'active' ? '<span class="badge pulse">En cours</span>' : g.status === 'done' ? '<span class="badge amber">Terminée</span>' : '<span class="badge grey">Abandonnée</span>';
    const l = state.links.find(x => x.id === g.linkId);
    return `<a class="hrow" href="${href}">${avatar(g.other, 'sm')}
      <div class="ellipsis"><b>${esc(l ? linkName(l) : g.other.pseudo)}</b><div class="muted small">${g.size} questions · ${fmtDate(g.created_at)}</div></div>
      <span class="st">${st}</span>
      <span class="score ${g.score ? 'rank ' + g.score.rank.rarity : 'muted'}">${g.score && g.score.completed ? g.score.score + '%' : '—'}</span></a>`;
  }

  async function renameLink(l, after) {
    const v = await promptModal('✏️ Renommer le lien', l.label, l.other.pseudo, `Ce nom n’est visible que par toi. Laisse vide pour revenir à « ${esc(l.other.pseudo)} ».`);
    if (v === null) return;
    await api(`/api/links/${l.id}`, { method: 'PATCH', body: { label: v } });
    await refreshLinks();
    toast('Lien renommé ✓');
    after && after();
  }
  async function endLink(l) {
    const ok = await confirmModal('💔 Rompre le lien ?', `La messagerie avec <b>${esc(linkName(l))}</b> (textes, vocaux, photos) sera <b>définitivement effacée</b>. L’historique des parties est conservé.`, 'Rompre', true);
    if (!ok) return;
    await api(`/api/links/${l.id}/end`, { method: 'POST' });
    await refreshLinks();
    go('#/');
  }

  // =========================================================
  // PAGE D'UN LIEN : course / messagerie / parties
  // =========================================================
  const setup = { size: 10, themes: [] };

  async function renderLink(soft = false) {
    const { id, tab } = state.params;
    const link = await api(`/api/links/${id}`);
    if (link.status !== 'active') {
      app.innerHTML = `<div class="frame center page"><h3>Ce lien n’est pas actif</h3><p class="muted">${link.status === 'pending' ? 'L’invitation est en attente.' : 'Le lien a été rompu.'}</p><a class="btn sm" href="#/">Retour aux Links</a></div>`;
      return;
    }
    app.innerHTML = `<div class="${soft ? '' : 'page'}">
      <div class="link-head">
        ${avatar(state.me, 'lg')}<span class="vs">VS</span>${avatar(link.other, 'lg', true)}
        <div class="title ellipsis">
          <h1><span class="ellipsis">${esc(linkName(link))}</span><button class="iconbtn sm flat" id="rename" title="Renommer le lien">✏️</button></h1>
          <div class="bio ellipsis">@${esc(link.other.pseudo)}${link.other.bio ? ' · ' + esc(link.other.bio) : ''}</div>
        </div>
        <div class="menu-wrap"><button class="iconbtn flat" id="linkMenu" title="Options">⋯</button></div>
      </div>
      <div class="subtabs">
        <a class="subtab ${tab === 'play' ? 'on' : ''}" href="#/link/${id}/play">🏁 Course</a>
        <a class="subtab ${tab === 'chat' ? 'on' : ''}" href="#/link/${id}/chat">💬 Messages <span class="unread" data-unread="${id}" ${link.unread && tab !== 'chat' ? '' : 'hidden'}>${link.unread}</span></a>
        <a class="subtab ${tab === 'games' ? 'on' : ''}" href="#/link/${id}/games">📜 Parties</a>
      </div>
      <div id="tabBody"></div></div>`;
    $('#rename').onclick = () => renameLink(link, () => renderLink(true));
    $('#linkMenu').onclick = e => { e.stopPropagation(); openMenu(e.currentTarget, [
      { icon: '✏️', label: 'Renommer le lien', onClick: () => renameLink(link, () => renderLink(true)) },
      { icon: '💔', label: 'Rompre le lien', danger: true, onClick: () => endLink(link) },
    ]); };
    const body = $('#tabBody');
    if (tab === 'chat') return chat.start(body, link);
    if (tab === 'games') return renderLinkGames(body, link);
    return renderSetup(body, link);
  }

  function renderSetup(body, link) {
    if (link.activeGame) {
      body.innerHTML = `
        <div class="frame center">
          <h3>🏁 Une course est en cours</h3>
          <p class="muted">Partie de ${link.activeGame.size} questions avec ${esc(linkName(link))}.</p>
          <a class="btn green big" href="#/game/${link.activeGame.id}">▶ REPRENDRE</a>
        </div>`;
      return;
    }
    const modes = [
      { n: 5, label: 'Sprint', desc: 'Pour briser la glace' },
      { n: 10, label: 'Circuit', desc: 'Le bon dosage' },
      { n: 20, label: 'Underground', desc: 'Le grand marathon' },
    ];
    const T = state.themes;
    const count = () => setup.themes.length ? `${setup.themes.length} thème${setup.themes.length > 1 ? 's' : ''} choisi${setup.themes.length > 1 ? 's' : ''}` : 'Tous les thèmes';
    body.innerHTML = `
      <div class="frame">
        <h3>1 · Choisis ta course</h3>
        <div class="grid three">
          ${modes.map(m => `<button class="mode ${setup.size === m.n ? 'on' : ''}" data-size="${m.n}"><div class="num">${m.n}</div><div class="label">${m.label}</div><div class="desc">${m.desc}</div></button>`).join('')}
        </div>
        <div class="row mt2" style="margin-bottom:12px"><h3 style="margin:0">2 · Thèmes</h3><span class="spacer"></span><button class="btn-ghost" id="allThemes">Tous les thèmes</button></div>
        <div class="chips">
          ${Object.entries(T).map(([k, t]) => `<button class="chip ${setup.themes.includes(k) ? 'on' : ''}" data-theme="${k}" style="--c:${t.color}">${t.icon} ${esc(t.label)}</button>`).join('')}
        </div>
        <div class="setup-foot"><span class="muted" id="themeCount">${count()}</span><button class="btn green big" id="start">LANCER LA COURSE</button></div>
        <p class="error center" id="startErr"></p>
      </div>`;
    $$('[data-size]').forEach(b => b.onclick = () => { setup.size = +b.dataset.size; $$('[data-size]').forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-theme]').forEach(b => b.onclick = () => {
      const k = b.dataset.theme;
      setup.themes = setup.themes.includes(k) ? setup.themes.filter(x => x !== k) : [...setup.themes, k];
      b.classList.toggle('on');
      $('#themeCount').textContent = count();
    });
    $('#allThemes').onclick = () => { setup.themes = []; $$('[data-theme]').forEach(b => b.classList.remove('on')); $('#themeCount').textContent = count(); };
    $('#start').onclick = async e => {
      e.currentTarget.classList.add('loading');
      try { const g = await api(`/api/links/${link.id}/games`, { body: { size: setup.size, themes: setup.themes } }); go(`#/game/${g.id}`); }
      catch (err) { e.currentTarget.classList.remove('loading'); $('#startErr').textContent = err.message; }
    };
  }

  async function renderLinkGames(body, link) {
    const games = await api(`/api/links/${link.id}/games`);
    body.innerHTML = games.length ? `<div class="glass hrows">${games.map(historyRow).join('')}</div>` : '<div class="empty">Aucune partie pour le moment. Lance ta première course !</div>';
  }

  // =========================================================
  // PARTIE (avec messagerie intégrée)
  // =========================================================
  const drafts = {};

  function cardHtml({ num, round, img, text, who, whoColor, cls = '', answer = false }) {
    const t = state.themes[round.theme] || {};
    let art;
    if (img && img.image) art = `<img src="${esc(img.thumb || img.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'glyph',textContent:'${t.icon}'}))">`;
    else if (img && img.imageStatus === 'pending') art = `<span class="glyph">${t.icon}</span><div class="shimmer"></div>`;
    else art = `<span class="glyph">${t.icon}</span>`;
    return `<div class="card ${cls}" style="--c:${esc(round.color)}">
      ${num != null ? `<div class="gem">${num}</div>` : ''}
      <div class="art">${art}</div>
      <div class="banner">${t.icon} ${esc(round.themeLabel)}</div>
      <div class="text ${answer ? 'answer' : ''}">${text}</div>
      <div class="rarity"></div>
      ${who ? `<div class="who" style="--c:${esc(whoColor)}">${esc(who)}</div>` : ''}
    </div>`;
  }
  const ynHtml = a => `<span class="yn">${esc(a.toUpperCase())}</span>`;

  // Monte la mise en page partie + panneau de discussion (une seule fois par partie)
  async function mountGame(g) {
    if (app.dataset.game == g.id && $('#gameMain')) return;
    app.dataset.game = g.id;
    app.innerHTML = `<div class="game-layout"><div id="gameMain"></div><aside class="game-aside" id="gameAside"></aside></div>
      <button class="iconbtn chat-fab" id="chatFab" title="Messagerie">💬<span class="nbadge" id="fabBadge" hidden></span></button>`;
    const aside = $('#gameAside');
    const fab = $('#chatFab');
    const setOpen = open => {
      aside.classList.toggle('open', open);
      $$('.scrim').forEach(s => s.remove());
      if (open) {
        const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => setOpen(false); document.body.appendChild(s);
        $('#fabBadge').hidden = true; chat.markRead();
        setTimeout(() => { const i = $('#chatIn'); i && window.innerWidth > 760 && i.focus(); }, 300);
      }
    };
    fab.onclick = () => setOpen(!aside.classList.contains('open'));
    const link = state.links.find(l => l.id === g.linkId) || await api(`/api/links/${g.linkId}`).catch(() => null);
    if (link && link.status === 'active') {
      chat.start(aside, link, {
        compact: true,
        isVisible: () => window.innerWidth > 1100 || aside.classList.contains('open'),
        onClose: () => setOpen(false),
        onHidden: () => { const b = $('#fabBadge'); if (b) { b.hidden = false; b.textContent = (+b.textContent || 0) + 1; } },
      });
      if (link.unread) { $('#fabBadge').hidden = false; $('#fabBadge').textContent = link.unread; }
    } else { aside.innerHTML = '<div class="empty">La messagerie n’est pas disponible : le lien a été rompu.</div>'; }
    state.openGameChat = () => setOpen(true);
  }

  async function renderGame(soft = false) {
    const ta = $('#answerText');
    if (ta) drafts[ta.dataset.key] = ta.value;

    const g = await api(`/api/games/${state.params.id}`);
    await mountGame(g);
    const main = $('#gameMain');
    const me = g.players.find(p => p.id === g.me);
    const other = g.players.find(p => p.id !== g.me);
    const l = state.links.find(x => x.id === g.linkId);
    const otherName = l ? linkName(l) : other.pseudo;
    const seenKey = `hd_seen_${g.id}`;
    const seen = store.get(seenKey, -1);
    const revealed = g.rounds.filter(r => r.revealed).length;
    const myCount = g.rounds.filter(r => r.mine).length;
    const otherCount = g.rounds.filter(r => r.revealed || (r.other && r.other.answered)).length;

    const lane = (p, n, name) => `<div class="lane">${avatar(p, 'xs')}<span class="who">${esc(name)}</span><div class="track"><i style="--c:${esc(p.color)};width:${(n / g.total) * 100}%"></i></div><span>${n}/${g.total}</span></div>`;
    const header = `
      <div class="row" style="margin-bottom:12px">
        <a class="btn-neon sm" href="#/link/${g.linkId}"><span>← ${esc(otherName)}</span></a>
        <div class="spacer"></div>
        ${g.status === 'active' ? '<button class="btn-ghost danger" id="abandon">Abandonner</button>' : ''}
      </div>
      <div class="race">${lane(me, myCount, 'Toi')}${lane(other, otherCount, otherName)}</div>`;

    let content = '';
    if (revealed > 0 && seen < revealed - 1) {
      // Écran de révélation
      const idx = seen + 1;
      const r = g.rounds[idx];
      let banner;
      if (r.type === 'yesno') banner = r.mine.answer === r.other.answer
        ? '<div class="stylepts"><span>Perfect match</span><small>+1 SYNERGIE</small></div>'
        : '<div class="stylepts miss"><span>Duel d’opinions</span><small>LE DÉBAT EST OUVERT</small></div>';
      else banner = '<div class="stylepts"><span>Réponses dévoilées</span><small>À VOUS DE RACONTER</small></div>';
      const ans = a => (r.type === 'yesno' ? ynHtml(a.answer) : esc(a.answer));
      const isLast = idx === g.total - 1;
      content = `
        <p class="qline">« ${esc(r.question)} »</p>
        <div class="reveal">
          <div>${cardHtml({ num: idx + 1, round: r, img: r.mine, text: ans(r.mine), who: 'Toi', whoColor: me.color, answer: true })}<div class="credit">${esc(r.mine.credit || '')}</div></div>
          <div class="mid">VS</div>
          <div>${cardHtml({ num: idx + 1, round: r, img: r.other, text: ans(r.other), who: otherName, whoColor: other.color, answer: true })}<div class="credit">${esc(r.other.credit || '')}</div></div>
        </div>
        ${banner}
        <div class="center mt"><button class="btn green big" id="nextQ">${isLast ? 'VOIR LE RAPPORT' : 'QUESTION SUIVANTE →'}</button></div>
        ${revealed - 1 - idx > 1 ? `<div class="center mt"><button class="btn-ghost" id="skipAll">Passer les ${revealed - 1 - idx} révélations suivantes</button></div>` : ''}`;
      main.innerHTML = header + content;
      $('#nextQ').onclick = () => { store.set(seenKey, idx); if (isLast) go(`#/report/${g.id}`); else { renderGame(); window.scrollTo(0, 0); } };
      const skip = $('#skipAll'); if (skip) skip.onclick = () => { store.set(seenKey, revealed - 2); renderGame(); };
      bindAbandon(g);
      return;
    }

    if (g.status === 'done') {
      content = `<div class="frame center"><h3>🏁 Course terminée !</h3><p>Toutes les réponses sont sur la table.</p><a class="btn green big" href="#/report/${g.id}">VOIR LE RAPPORT</a></div>`;
    } else if (g.status === 'abandoned') {
      content = `<div class="frame center"><h3>Course abandonnée</h3><p class="muted">${revealed} manche(s) jouée(s).</p>${revealed ? `<a class="btn sm" href="#/report/${g.id}">Voir le rapport partiel</a>` : ''}</div>`;
    } else {
      const r = g.rounds[g.current];
      if (r.mine) {
        content = `
          <p class="qline">« ${esc(r.question)} »</p>
          <div class="reveal">
            <div>${cardHtml({ num: g.current + 1, round: r, img: r.mine, text: r.type === 'yesno' ? ynHtml(r.mine.answer) : esc(r.mine.answer), who: 'Toi', whoColor: me.color, answer: true })}</div>
            <div class="mid">VS</div>
            <div><div class="card facedown"><div class="back"><span class="logo">HEART<b>DRIVE</b></span></div><div class="who" style="--c:${esc(other.color)}">${esc(otherName)}</div></div></div>
          </div>
          <div class="waiting"><span class="hourglass">⏳</span><br>En attente de ${esc(otherName)}…<small>Tu seras prévenu·e dès qu’elle/il aura répondu. En attendant, <a href="#" id="talk">envoie-lui un message 💬</a></small></div>`;
      } else {
        const key = `${g.id}-${g.current}`;
        content = `
          ${r.other.answered ? `<div class="center" style="margin-bottom:16px"><span class="badge pink pulse">${esc(otherName)} a déjà répondu !</span></div>` : ''}
          ${cardHtml({ num: g.current + 1, round: r, text: esc(r.question) })}
          <div class="answer-zone">
            ${r.type === 'yesno'
              ? `<div class="yesno"><button class="btn green" data-yn="oui">OUI</button><button class="btn red" data-yn="non">NON</button></div>`
              : `<form id="ansForm"><textarea class="input" id="answerText" data-key="${key}" maxlength="500" placeholder="Ta réponse…" required>${esc(drafts[key] || '')}</textarea>
                 <div class="center mt"><button class="btn green big" type="submit">JOUER LA CARTE</button></div>
                 <p class="hint">Une image illustrera automatiquement ta réponse · Ctrl/⌘ + Entrée pour valider</p></form>`}
            <p class="error center" id="ansErr"></p>
          </div>`;
      }
    }

    const past = g.rounds.filter(r => r.revealed && r.idx <= seen);
    if (past.length) {
      content += `<div class="sec-head mt2" style="margin-bottom:12px"><h2 style="font-size:18px">Manches précédentes</h2><span class="line"></span></div><div class="rounds-strip">${past.map(r => `
        <div class="mini" style="--c:${esc(r.color)}">
          <div class="imgs">
            <div>${r.mine.thumb ? `<img src="${esc(r.mine.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : r.icon}</div>
            <div>${r.other.thumb ? `<img src="${esc(r.other.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : r.icon}</div>
          </div>
          <div class="body"><div class="q">${r.icon} ${esc(r.question)}</div>
            <div><b style="color:${esc(me.color)}">Toi :</b> ${esc(r.mine.answer)}</div>
            <div><b style="color:${esc(other.color)}">${esc(otherName)} :</b> ${esc(r.other.answer)}</div>
          </div>
        </div>`).join('')}</div>`;
    }

    main.innerHTML = header + content;
    if (!soft) window.scrollTo(0, 0);
    bindAbandon(g);
    const talk = $('#talk'); if (talk) talk.onclick = e => { e.preventDefault(); state.openGameChat ? state.openGameChat() : go(`#/link/${g.linkId}/chat`); };

    const submit = async answer => {
      try { await api(`/api/games/${g.id}/answer`, { body: { idx: g.current, answer } }); delete drafts[`${g.id}-${g.current}`]; renderGame(); }
      catch (e) { $('#ansErr').textContent = e.message; $$('[data-yn], #ansForm button').forEach(x => x.disabled = false); }
    };
    $$('[data-yn]').forEach(b => b.onclick = () => { $$('[data-yn]').forEach(x => x.disabled = true); submit(b.dataset.yn); });
    const form = $('#ansForm');
    if (form) {
      const t = $('#answerText');
      if (window.innerWidth > 760) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
      t.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
      form.onsubmit = e => { e.preventDefault(); const v = t.value.trim(); if (v) { form.querySelector('button').disabled = true; submit(v); } };
    }
  }

  function bindAbandon(g) {
    const b = $('#abandon');
    if (b) b.onclick = async () => {
      if (!await confirmModal('Abandonner la course ?', 'La partie sera arrêtée pour vous deux. Les manches déjà jouées restent visibles dans le rapport.', 'Abandonner', true)) return;
      await api(`/api/games/${g.id}/abandon`, { method: 'POST' });
      renderGame();
    };
  }

  // =========================================================
  // RAPPORT
  // =========================================================
  async function renderReport() {
    const r = await api(`/api/games/${state.params.id}/report`);
    const me = r.players.find(p => p.id === state.me.id) || r.players[0];
    const other = r.players.find(p => p.id !== me.id) || r.players[1];
    const l = state.links.find(x => x.id === r.game.linkId);
    const otherName = l ? linkName(l) : other.pseudo;
    const rarityColor = { legendary: '#ffa500', epic: '#a335ee', rare: '#0070dd', common: '#9d9d9d' }[r.rank.rarity];
    const statOf = p => r.stats.find(s => s.id === p.id);
    const img = (ans, round) => `<div class="img" style="--c:${esc(round.color)}">${ans && ans.thumb ? `<img src="${esc(ans.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : round.icon}</div>`;
    const verdict = x => x.type === 'yesno' ? (x.match ? '<span class="badge">Match</span>' : x.complete ? '<span class="badge pink">Duel</span>' : '') : x.echo ? '<span class="badge amber">Même longueur d’onde</span>' : '';
    const nameOf = p => (p.id === me.id ? 'Toi' : otherName);

    app.innerHTML = `<div class="page">
      <div class="row noprint" style="margin-bottom:12px">
        <a class="btn-neon sm" href="${l && l.status === 'active' ? `#/link/${r.game.linkId}/games` : '#/home/history'}"><span>← Retour</span></a>
        <div class="spacer"></div>
        <button class="btn-ghost" onclick="window.print()">🖨️ Imprimer / PDF</button>
      </div>
      <h1 class="hud">Rapport de course</h1>
      <p class="sub">Toi × ${esc(otherName)} · ${fmtDate(r.game.created_at)} · ${r.completed}/${r.game.size} manches ${r.game.status === 'abandoned' ? '· <span class="badge grey">abandonnée</span>' : ''}</p>

      <div class="grid two">
        <div class="frame center">
          <div class="row" style="justify-content:center;margin-bottom:14px">${avatar(me)}<span class="muted">×</span>${avatar(other)}</div>
          <div class="score-ring" style="--p:${r.score};--c:${rarityColor}"><b>${r.score}<small>%</small></b></div>
          <div class="rank ${r.rank.rarity}">${esc(r.rank.name)}</div>
          <p class="muted small">${r.yesTotal ? `${r.yesMatch}/${r.yesTotal} réponses oui/non identiques` : 'Pas de question oui/non dans cette partie'}${r.echoes ? ` · ${r.echoes} écho(s) dans les réponses libres` : ''}</p>
        </div>
        <div class="frame parch">
          <h3>📜 Faits marquants</h3>
          ${r.highlights.length ? `<ul>${r.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : '<p class="muted">Jouez plus de manches pour débloquer des faits marquants.</p>'}
          ${r.agreed.length ? `<p><b>Vous êtes d’accord sur :</b></p><ul>${r.agreed.slice(0, 5).map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
          ${r.disagreed.length ? `<p><b>Sujets à débattre autour d’un verre :</b></p><ul>${r.disagreed.slice(0, 5).map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>

      <div class="grid two mt">
        <div class="frame stone">
          <h3>🎯 Synergie par thème</h3>
          ${r.perTheme.map(t => `<div class="bar-row"><span>${t.icon} ${esc(t.label)}</span><div class="track"><i style="--c:${t.color};width:${(t.match / t.total) * 100}%"></i></div><span>${t.match}/${t.total}</span></div>`).join('') || '<p class="muted">—</p>'}
        </div>
        <div class="frame stone">
          <h3>🏎️ Télémétrie</h3>
          <div class="grid" style="grid-template-columns:1fr 1fr">
            ${[me, other].map(p => { const s = statOf(p); return `
              <div class="stat"><div class="row" style="justify-content:center">${avatar(p, 'xs')} <b style="font-size:15px;color:#fff;text-shadow:none">${esc(nameOf(p))}</b></div>
                <b>${s.avgSeconds < 60 ? s.avgSeconds + 's' : Math.round(s.avgSeconds / 60) + 'min'}</b><span>temps moyen</span>
                <b>${s.yes}</b><span>« oui » donnés</span></div>`; }).join('')}
          </div>
        </div>
      </div>

      <div class="sec-head pink mt2"><h2>Toutes les manches</h2><span class="line"></span></div>
      <div class="list">
        ${r.rounds.filter(x => x.complete).map((x, i) => `
          <div class="rep-round">
            <div class="q"><span style="font-family:var(--f-hud);color:var(--gold)">#${i + 1}</span> ${x.icon} ${esc(x.question)} <div class="spacer"></div>${verdict(x)}</div>
            ${[me, other].map(p => `<div class="rep-ans">${img(x.answers[p.id], x)}<div><div class="pseudo" style="color:${esc(p.color)}">${esc(nameOf(p))}</div><div>${esc(x.answers[p.id] ? x.answers[p.id].answer : '—')}</div></div></div>`).join('')}
          </div>`).join('') || '<div class="empty">Aucune manche complète.</div>'}
      </div></div>`;
    window.scrollTo(0, 0);
  }

  // =========================================================
  // HISTORIQUE COMPLET
  // =========================================================
  async function renderHistory() {
    const games = await api('/api/history');
    const done = games.filter(g => g.score && g.score.completed);
    const avg = done.length ? Math.round(done.reduce((s, g) => s + g.score.score, 0) / done.length) : 0;
    app.innerHTML = `<div class="page">
      <a class="btn-neon sm" href="#/home/history"><span>← Accueil</span></a>
      <h1 class="hud mt">Historique des courses</h1>
      <div class="grid three" style="margin-bottom:18px">
        <div class="stat"><b>${games.length}</b><span>parties</span></div>
        <div class="stat"><b>${games.filter(g => g.status === 'done').length}</b><span>terminées</span></div>
        <div class="stat"><b>${avg}%</b><span>synergie moyenne</span></div>
      </div>
      ${games.length ? `<div class="glass hrows">${games.map(historyRow).join('')}</div>` : '<div class="empty">Aucune partie pour le moment.</div>'}
    </div>`;
    window.scrollTo(0, 0);
  }

  // =========================================================
  // PROFIL
  // =========================================================
  async function renderProfile() {
    const history = await api('/api/history');
    const me = state.me;
    const done = history.filter(g => g.score && g.score.completed);
    const avg = done.length ? Math.round(done.reduce((s, g) => s + g.score.score, 0) / done.length) : 0;
    let color = me.color;
    app.innerHTML = `<div class="page">
      <h1 class="hud">Mon profil</h1>
      <div class="profile-grid">
        <div class="frame profile-card">
          <div id="bigAvatar">${avatar(me, 'xl')}</div>
          <div class="pname">${esc(me.pseudo)}</div>
          <div class="pbio">${esc(me.bio) || 'Pas encore de bio.'}</div>
          <div class="row" style="justify-content:center">
            <button class="btn-ghost" id="avGallery">🖼️ Choisir</button>
            <button class="btn-ghost" id="avCamera">📸 Prendre</button>
            ${me.avatar ? '<button class="btn-ghost danger" id="avDelete" title="Supprimer la photo">🗑️</button>' : ''}
          </div>
          <div class="stats-row">
            <div class="stat"><b>${state.links.filter(l => l.status === 'active').length}</b><span>links</span></div>
            <div class="stat"><b>${done.length}</b><span>courses</span></div>
            <div class="stat"><b>${avg}%</b><span>synergie</span></div>
          </div>
        </div>
        <div class="grid">
          <form class="frame" id="profileForm">
            <h3>✏️ Mes infos</h3>
            <label class="field"><span>Pseudo</span><input class="input" name="pseudo" value="${esc(me.pseudo)}" maxlength="20" autocapitalize="off" spellcheck="false"><small>Si tu le changes, ton binôme verra ton nouveau pseudo.</small></label>
            <label class="field"><span>Bio <em id="bioCount" style="font-style:normal;color:var(--muted)"></em></span><textarea class="input" name="bio" maxlength="160" rows="3" placeholder="Une phrase qui te résume…">${esc(me.bio)}</textarea></label>
            <div class="field"><span>Couleur de pilote</span><div class="swatches">${COLORS.map(c => `<button type="button" class="swatch ${c === color ? 'on' : ''}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div></div>
            <div class="row"><button class="btn green" type="submit">Enregistrer</button><span class="error" id="profErr"></span></div>
          </form>
          <form class="frame stone" id="pinForm">
            <h3>🔐 Code secret</h3>
            <div class="grid two" style="gap:12px">
              <label class="field"><span>Code actuel</span><input class="input" type="password" name="current" autocomplete="current-password"></label>
              <label class="field"><span>Nouveau code</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="4"></label>
            </div>
            <div class="row"><button class="btn sm" type="submit">Changer le code</button><span class="error" id="pinErr"></span></div>
          </form>
          <div class="center"><button class="btn-ghost danger" id="logout">⏻ Se déconnecter</button></div>
        </div>
      </div></div>`;

    const form = $('#profileForm');
    const bioCount = () => { $('#bioCount').textContent = `(${form.bio.value.length}/160)`; };
    bioCount(); form.bio.oninput = bioCount;
    $$('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; $$('[data-color]').forEach(x => x.classList.toggle('on', x === b)); });
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        state.me = await api('/api/me', { method: 'PATCH', body: { pseudo: form.pseudo.value, bio: form.bio.value, color } });
        store.set('hd_last_pseudo', state.me.pseudo);
        toast('Profil enregistré ✓'); renderShell(); renderProfile();
      } catch (err) { $('#profErr').textContent = err.message; }
    };
    $('#pinForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try { await api('/api/me/pin', { body: { current: f.current.value, next: f.next.value } }); f.reset(); $('#pinErr').textContent = ''; toast('Code secret modifié ✓'); }
      catch (err) { $('#pinErr').textContent = err.message; }
    };
    const upload = async file => {
      if (!file) return;
      const blob = await processImage(file, 512, true);
      const fd = new FormData(); fd.append('file', blob, 'avatar.jpg');
      $('#bigAvatar').style.opacity = .5;
      try { state.me = await api('/api/me/avatar', { body: fd }); toast('Photo mise à jour ✓'); renderShell(); renderProfile(); }
      catch (err) { $('#bigAvatar').style.opacity = 1; toast(esc(err.message)); }
    };
    $('#avGallery').onclick = async () => upload(await pickFile('image/*'));
    $('#avCamera').onclick = async () => upload(await openCamera('user'));
    const del = $('#avDelete');
    if (del) del.onclick = async () => {
      if (!await confirmModal('Supprimer la photo ?', 'Ton avatar redeviendra ton initiale.', 'Supprimer', true)) return;
      state.me = await api('/api/me/avatar', { method: 'DELETE' }); renderShell(); renderProfile();
    };
    $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); state.me = null; state.links = []; state.socket && state.socket.disconnect(); go('#/login'); };
    window.scrollTo(0, 0);
  }

  // =========================================================
  // MESSAGERIE : texte, vocal (10 s max), photo (galerie ou appareil)
  // =========================================================
  const chat = (() => {
    let link = null, msgs = [], rec = null, opts = {}, readTimer = null;

    const isOpen = id => !!link && link.id === id;
    const isVisible = () => !!link && (!opts.isVisible || opts.isVisible()) && document.visibilityState === 'visible';
    function stop() { if (rec) rec.cancel(); link = null; opts = {}; }
    function markRead() {
      if (!link) return;
      clearTimeout(readTimer);
      const id = link.id;
      readTimer = setTimeout(async () => { await api(`/api/links/${id}/read`, { method: 'POST' }).catch(() => {}); refreshLinks(); }, 300);
    }

    async function start(container, l, o = {}) {
      link = l; opts = o; msgs = [];
      container.innerHTML = `
        <div class="chat ${o.compact ? 'compact' : ''}">
          ${o.compact ? `<div class="chat-head">${avatar(l.other, 'sm', true)}<div class="t ellipsis">${esc(linkName(l))}</div><button class="iconbtn sm flat" id="chatClose" title="Fermer">✖</button></div>` : ''}
          <div class="msgs" id="msgs"><div class="empty">Chargement…</div></div>
          <div class="typing" id="typing"></div>
          <form class="bar" id="chatForm" autocomplete="off">
            <button type="button" class="iconbtn sm flat" id="camBtn" title="Prendre une photo">📸</button>
            <button type="button" class="iconbtn sm flat" id="galBtn" title="Envoyer une image">🖼️</button>
            <div class="composer" id="composer"><input class="input" id="chatIn" placeholder="Message…" maxlength="2000" enterkeyhint="send"></div>
            <button type="button" class="iconbtn" id="micBtn" title="Message vocal (10 s max)">🎙️</button>
            <button type="submit" class="iconbtn" id="sendBtn" title="Envoyer" hidden>➤</button>
          </form>
        </div>
        ${o.compact ? '' : '<p class="muted center small">Messages, vocaux et photos sont conservés tant que le lien est actif.</p>'}`;
      const close = $('#chatClose');
      if (close) close.onclick = () => opts.onClose && opts.onClose();
      const list = await api(`/api/links/${l.id}/messages`);
      if (link !== l) return;
      msgs = list;
      draw(true);
      if (isVisible()) markRead();
      bindComposer(l);
      if (!o.compact && window.innerWidth > 760) $('#chatIn').focus({ preventScroll: true });
    }

    function bindComposer(l) {
      const input = $('#chatIn');
      const sendBtn = $('#sendBtn'), micBtn = $('#micBtn');
      let lastTyping = 0;
      const toggle = () => { const has = !!input.value.trim(); sendBtn.hidden = !has; micBtn.hidden = has; };
      input.oninput = () => { toggle(); if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); state.socket.emit('typing', { linkId: l.id }); } };
      toggle();
      $('#chatForm').onsubmit = async e => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        input.value = ''; toggle();
        const fd = new FormData(); fd.append('kind', 'text'); fd.append('body', v);
        try { await api(`/api/links/${l.id}/messages`, { body: fd }); } catch (err) { toast(esc(err.message)); input.value = v; toggle(); }
        input.focus({ preventScroll: true });
      };
      const sendPhoto = async file => {
        if (!file) return;
        try {
          const blob = await processImage(file, 1600);
          const fd = new FormData(); fd.append('kind', 'photo'); fd.append('file', blob, 'photo.jpg');
          await api(`/api/links/${l.id}/messages`, { body: fd });
        } catch (err) { toast(esc(err.message || 'Envoi impossible')); }
      };
      $('#camBtn').onclick = async () => sendPhoto(await openCamera('environment'));
      $('#galBtn').onclick = async () => sendPhoto(await pickFile('image/*'));
      micBtn.onclick = () => (rec ? rec.stop() : record(l));
    }

    function add(m) {
      if (!link || m.linkId !== link.id || msgs.some(x => x.id === m.id)) return;
      msgs.push(m);
      draw(true);
      if (m.sender !== state.me.id) {
        const ty = $('#typing'); if (ty) ty.textContent = '';
        if (isVisible()) markRead(); else opts.onHidden && opts.onHidden();
      }
    }

    function draw(scroll) {
      const box = $('#msgs');
      if (!box) return;
      if (!msgs.length) { box.innerHTML = `<div class="empty">Aucun message. Dis bonjour à ${esc(linkName(link))} 👋</div>`; return; }
      let lastDay = '';
      box.innerHTML = msgs.map(m => {
        const day = fmtDay(m.created_at);
        const sep = day !== lastDay ? `<div class="daysep">${day}</div>` : '';
        lastDay = day;
        const mine = m.sender === state.me.id;
        let inner = '', media = false;
        if (m.kind === 'text') inner = esc(m.body).replace(/\n/g, '<br>');
        if (m.kind === 'photo') { media = true; inner = `<img src="${esc(m.url)}" alt="photo" data-zoom loading="lazy">${m.body ? `<div style="padding:4px 6px">${esc(m.body)}</div>` : ''}`; }
        if (m.kind === 'voice') { media = true; inner = `<div class="vtag">🎙️ VOCAL · ${Math.round(m.duration || 0)} s</div><audio controls preload="metadata" src="${esc(m.url)}"></audio>`; }
        return `${sep}<div class="msg ${mine ? 'me' : 'them'} ${media ? 'media' : ''}">${inner}<div class="time">${fmtTime(m.created_at)}</div></div>`;
      }).join('');
      $$('[data-zoom]', box).forEach(img => img.onclick = () => {
        const lb = document.createElement('div'); lb.className = 'lightbox';
        lb.innerHTML = `<img src="${esc(img.src)}" alt="">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb);
      });
      $$('img', box).forEach(img => img.addEventListener('load', () => { if (scroll) box.scrollTop = box.scrollHeight; }, { once: true }));
      if (scroll) box.scrollTop = box.scrollHeight;
    }

    // Enregistrement vocal limité à 10 secondes
    async function record(l) {
      if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Ton navigateur ne permet pas l’enregistrement audio.');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { return toast('Micro refusé : autorise-le dans ton navigateur.'); }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      const MAX = 10000;
      const t0 = Date.now();
      let cancelled = false;
      const composer = $('#composer');
      const saved = composer.innerHTML;
      ['#camBtn', '#galBtn'].forEach(s => { const b = $(s); if (b) b.hidden = true; });
      composer.innerHTML = `<div class="recbar"><span class="pulse">● REC</span><div class="track"><i id="recProg" style="--c:var(--red);width:0"></i></div><span id="recSec">0.0s</span><button type="button" class="iconbtn sm flat" id="recCancel" title="Annuler">✖</button></div>`;
      const mic = $('#micBtn'); mic.classList.add('rec'); mic.textContent = '➤'; mic.title = 'Envoyer le vocal';
      const tick = setInterval(() => {
        const el = Date.now() - t0;
        const p = $('#recProg'); if (p) p.style.width = Math.min(100, (el / MAX) * 100) + '%';
        const s = $('#recSec'); if (s) s.textContent = Math.min(10, el / 1000).toFixed(1) + 's';
        if (el >= MAX) finish();
      }, 100);
      mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        clearInterval(tick);
        stream.getTracks().forEach(t => t.stop());
        rec = null;
        if (composer.isConnected) {
          composer.innerHTML = saved;
          const m2 = $('#micBtn'); if (m2) { m2.classList.remove('rec'); m2.textContent = '🎙️'; m2.title = 'Message vocal (10 s max)'; }
          ['#camBtn', '#galBtn'].forEach(s => { const b = $(s); if (b) b.hidden = false; });
          bindComposer(l);
        }
        if (cancelled || !chunks.length) return;
        const duration = Math.min(10, (Date.now() - t0) / 1000);
        const blob = new Blob(chunks, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
        const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const fd = new FormData(); fd.append('kind', 'voice'); fd.append('duration', duration.toFixed(1)); fd.append('file', blob, `vocal.${ext}`);
        try { await api(`/api/links/${l.id}/messages`, { body: fd }); } catch (err) { toast(esc(err.message)); }
      };
      function finish() { if (mr.state !== 'inactive') mr.stop(); }
      rec = { stop: finish, cancel: () => { cancelled = true; finish(); } };
      $('#recCancel').onclick = () => rec && rec.cancel();
      mr.start(250);
    }

    document.addEventListener('visibilitychange', () => { if (isVisible()) markRead(); });
    return { start, add, stop, isOpen, isVisible, markRead };
  })();

  render();
})();
