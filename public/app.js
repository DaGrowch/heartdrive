/* HEARTDRIVE — client */
(() => {
  'use strict';

  // ---------- Utilitaires ----------
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
  const initial = p => esc((p || '?').trim().charAt(0).toUpperCase());

  async function api(path, opts = {}) {
    const o = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
    if (opts.body instanceof FormData) o.body = opts.body;
    else if (opts.body) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(path, o);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login' && path !== '/api/register') { state.me = null; go('#/login'); throw new Error('Non connecté'); }
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  }

  function toast(html, cls = '', onclick) {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = html;
    t.onclick = () => { t.remove(); onclick && onclick(); };
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  function avatar(user, size = '', withDot = false) {
    return `<div class="avatar ${size}" style="--c:${esc(user.color)}">${initial(user.pseudo)}${withDot ? `<span class="dot ${user.online ? 'on' : ''}" data-presence="${user.id}"></span>` : ''}</div>`;
  }

  // ---------- État global ----------
  const state = { me: null, themes: {}, socket: null, unread: store.get('hd_unread', {}), route: '', typingTimer: null };
  const saveUnread = () => store.set('hd_unread', state.unread);
  const go = h => { if (location.hash === h) render(); else location.hash = h; };

  // ---------- Barre du haut ----------
  function renderTopbar() {
    const tb = $('#topbar');
    if (!state.me) { tb.hidden = true; return; }
    tb.hidden = false;
    const r = state.route;
    tb.innerHTML = `
      <a class="logo" href="#/">HEART<b>DRIVE</b></a>
      <nav>
        <a class="navlink ${r === '' ? 'on' : ''}" href="#/">Garage</a>
        <a class="navlink ${r === 'history' ? 'on' : ''}" href="#/history">Historique</a>
        <span class="me-chip">${avatar(state.me, 'sm')} ${esc(state.me.pseudo)}</span>
        <button class="navlink" id="logout" title="Déconnexion">⏻</button>
      </nav>`;
    $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); state.me = null; state.socket && state.socket.disconnect(); go('#/login'); };
  }

  // ---------- Temps réel ----------
  function connectSocket() {
    if (state.socket) state.socket.disconnect();
    const s = io({ withCredentials: true });
    state.socket = s;
    s.on('links', () => { if (['', 'link'].includes(state.route)) render(); });
    s.on('game', ({ gameId, linkId }) => {
      if (state.route === 'game' && state.params.id == gameId) return renderGame(true);
      if (state.route === 'link' && state.params.id == linkId && state.params.tab !== 'chat') return render();
      if (state.route === '') return render();
    });
    s.on('message', m => {
      if (state.route === 'link' && state.params.id == m.linkId && state.params.tab === 'chat') { chat.add(m); return; }
      if (m.sender !== state.me.id) {
        state.unread[m.linkId] = (state.unread[m.linkId] || 0) + 1; saveUnread();
        const label = m.kind === 'voice' ? '🎙️ Message vocal' : m.kind === 'photo' ? '📷 Photo' : esc(m.body).slice(0, 80);
        toast(`<b>Nouveau message</b><br>${label}`, 'pink', () => go(`#/link/${m.linkId}/chat`));
        if (state.route === '') render();
        $$(`[data-unread="${m.linkId}"]`).forEach(el => { el.textContent = state.unread[m.linkId]; el.hidden = false; });
      }
    });
    s.on('presence', ({ userId, online }) => $$(`[data-presence="${userId}"]`).forEach(d => d.classList.toggle('on', online)));
    s.on('typing', ({ linkId }) => {
      const el = $('#typing');
      if (!el || state.params.id != linkId) return;
      el.textContent = 'est en train d’écrire…';
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => { el.textContent = ''; }, 2500);
    });
  }

  // ---------- Routeur ----------
  async function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const route = parts[0] || '';
    state.route = route;
    state.params = {};
    if (!state.me && route !== 'login') {
      try { state.me = await api('/api/me'); connectSocket(); } catch { return go('#/login'); }
    }
    if (!Object.keys(state.themes).length) state.themes = await fetch('/api/themes').then(r => r.json());
    renderTopbar();
    window.scrollTo(0, 0);
    chat.stop();
    try {
      if (route === 'login') return renderAuth();
      if (route === 'link') { state.params = { id: parts[1], tab: parts[2] || 'play' }; return await renderLink(); }
      if (route === 'game') { state.params = { id: parts[1] }; return await renderGame(); }
      if (route === 'report') { state.params = { id: parts[1] }; return await renderReport(); }
      if (route === 'history') return await renderHistory();
      return await renderLobby();
    } catch (e) {
      app.innerHTML = `<div class="frame center"><h3>Sortie de route 💥</h3><p>${esc(e.message)}</p><a class="btn sm" href="#/">Retour au garage</a></div>`;
    }
  }
  window.addEventListener('hashchange', render);

  // =========================================================
  // AUTH
  // =========================================================
  function renderAuth() {
    let mode = 'login';
    $('#topbar').hidden = true;
    const draw = () => {
      app.innerHTML = `
      <div class="auth-wrap"><div>
        <div class="auth-logo"><div class="big">HEART<b>DRIVE</b></div><div class="tag">FAIRE CONNAISSANCE · À FOND</div></div>
        <form class="frame auth-card" id="authForm">
          <div class="tabs">
            <button type="button" class="tab ${mode === 'login' ? 'on' : ''}" data-m="login">Connexion</button>
            <button type="button" class="tab ${mode === 'register' ? 'on' : ''}" data-m="register">Nouveau pilote</button>
          </div>
          <label class="field"><span>Pseudo</span><input class="input" name="pseudo" autocomplete="username" maxlength="20" required></label>
          <label class="field"><span>Code secret</span><input class="input" name="pin" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="4" required></label>
          <p class="muted" style="font-size:13px;margin-top:-4px">${mode === 'register' ? 'Choisis un pseudo à donner à ton binôme. Le code secret te permet de te reconnecter.' : 'Content de te revoir sur la ligne de départ.'}</p>
          <div class="center mt"><button class="btn green big" type="submit">${mode === 'login' ? 'JOUER' : 'CRÉER'}</button></div>
          <p class="error center" id="authErr"></p>
        </form>
      </div></div>`;
      $$('.tab').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
      $('#authForm').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          state.me = await api(mode === 'login' ? '/api/login' : '/api/register', { body: { pseudo: f.get('pseudo'), pin: f.get('pin') } });
          connectSocket();
          go('#/');
        } catch (err) { $('#authErr').textContent = err.message; }
      };
      $('input[name=pseudo]').focus();
    };
    draw();
  }

  // =========================================================
  // LOBBY / GARAGE
  // =========================================================
  async function renderLobby() {
    const links = await api('/api/links');
    const incoming = links.filter(l => l.incoming);
    const outgoing = links.filter(l => l.status === 'pending' && !l.incoming);
    const active = links.filter(l => l.status === 'active');

    app.innerHTML = `
      <h1 class="hud">Garage</h1>
      <p class="sub">Entre le pseudo de la personne avec qui tu veux faire connaissance pour créer votre lien.</p>
      <div class="grid two">
        <form class="frame" id="linkForm">
          <h3>⚔️ Défier un pilote</h3>
          <label class="field"><span>Pseudo de ton binôme</span><input class="input" name="pseudo" placeholder="ex : Luna" maxlength="20" required></label>
          <div class="row"><button class="btn green" type="submit">CRÉER LE LIEN</button><span class="error" id="linkErr"></span></div>
          <p class="muted" style="font-size:13px">Elle/il recevra une invitation. Si elle/il t'a déjà invité·e, le lien s’active direct.</p>
        </form>
        <div class="frame stone">
          <h3>📨 Invitations</h3>
          <div class="list">
            ${incoming.map(l => `
              <div class="link-card" style="cursor:default">
                ${avatar(l.other, '', true)}
                <div><div class="name">${esc(l.other.pseudo)}</div><div class="meta">veut créer un lien avec toi</div></div>
                <div class="spacer"></div>
                <button class="btn sm green" data-accept="${l.id}">Accepter</button>
                <button class="btn-neon sm danger" data-decline="${l.id}"><span>✖</span></button>
              </div>`).join('')}
            ${outgoing.map(l => `
              <div class="link-card" style="cursor:default">
                ${avatar(l.other)}
                <div><div class="name">${esc(l.other.pseudo)}</div><div class="meta">en attente de sa réponse…</div></div>
                <div class="spacer"></div><span class="badge amber pulse">En attente</span>
              </div>`).join('')}
            ${!incoming.length && !outgoing.length ? '<div class="empty">Aucune invitation pour l’instant.</div>' : ''}
          </div>
        </div>
      </div>

      <h2 class="hud pink mt2">Mes liens</h2>
      <div class="list">
        ${active.map(l => `
          <a class="link-card" href="#/link/${l.id}">
            ${avatar(l.other, '', true)}
            <div>
              <div class="name">${esc(l.other.pseudo)}</div>
              <div class="meta">Lié·e·s depuis le ${fmtDate(l.activated_at)} · ${l.gamesCount} course(s) terminée(s)</div>
            </div>
            <div class="spacer"></div>
            ${l.activeGame ? '<span class="badge pulse">Course en cours</span>' : ''}
            <span class="unread" data-unread="${l.id}" ${state.unread[l.id] ? '' : 'hidden'}>${state.unread[l.id] || 0}</span>
          </a>`).join('') || '<div class="empty">Pas encore de lien actif. Défie quelqu’un au-dessus !</div>'}
      </div>`;

    $('#linkForm').onsubmit = async e => {
      e.preventDefault();
      try {
        const l = await api('/api/links', { body: { pseudo: new FormData(e.target).get('pseudo') } });
        if (l.status === 'active') go(`#/link/${l.id}`); else render();
      } catch (err) { $('#linkErr').textContent = err.message; }
    };
    $$('[data-accept]').forEach(b => b.onclick = async () => { const l = await api(`/api/links/${b.dataset.accept}/accept`, { method: 'POST' }); go(`#/link/${l.id}`); });
    $$('[data-decline]').forEach(b => b.onclick = async () => { await api(`/api/links/${b.dataset.decline}/decline`, { method: 'POST' }); render(); });
  }

  // =========================================================
  // PAGE D'UN LIEN : partie / messagerie / historique
  // =========================================================
  const setup = { size: 10, themes: [] };

  async function renderLink() {
    const { id, tab } = state.params;
    const link = await api(`/api/links/${id}`);
    if (link.status !== 'active') {
      app.innerHTML = `<div class="frame center"><h3>Ce lien n’est pas actif</h3><p class="muted">${link.status === 'pending' ? 'L’invitation est en attente.' : 'Le lien a été rompu.'}</p><a class="btn sm" href="#/">Retour au garage</a></div>`;
      return;
    }
    if (tab === 'chat') { state.unread[id] = 0; saveUnread(); }
    app.innerHTML = `
      <div class="link-head">
        ${avatar(state.me, 'lg')}<span class="vs">VS</span>${avatar(link.other, 'lg', true)}
        <div><h1 class="hud" style="margin:0">${esc(link.other.pseudo)}</h1><div class="muted">Lien actif depuis le ${fmtDate(link.activated_at)}</div></div>
      </div>
      <div class="subtabs">
        <a class="subtab ${tab === 'play' ? 'on' : ''}" href="#/link/${id}/play">🏁 Course</a>
        <a class="subtab ${tab === 'chat' ? 'on' : ''}" href="#/link/${id}/chat">💬 Messagerie <span class="unread" data-unread="${id}" ${state.unread[id] && tab !== 'chat' ? '' : 'hidden'}>${state.unread[id] || 0}</span></a>
        <a class="subtab ${tab === 'games' ? 'on' : ''}" href="#/link/${id}/games">📜 Parties</a>
      </div>
      <div id="tabBody"></div>`;
    const body = $('#tabBody');
    if (tab === 'chat') return chat.start(body, link);
    if (tab === 'games') return renderLinkGames(body, link);
    return renderSetup(body, link);
  }

  function renderSetup(body, link) {
    if (link.activeGame) {
      body.innerHTML = `
        <div class="frame center">
          <h3>Une course est en cours !</h3>
          <p class="muted">Partie de ${link.activeGame.size} questions avec ${esc(link.other.pseudo)}.</p>
          <a class="btn green big" href="#/game/${link.activeGame.id}">REPRENDRE</a>
        </div>
        <div class="center mt2 noprint"><button class="btn-neon sm danger" id="endLink"><span>Rompre le lien</span></button></div>`;
      bindEnd(link);
      return;
    }
    const modes = [
      { n: 5, label: 'Sprint', desc: 'Un tour rapide pour briser la glace' },
      { n: 10, label: 'Circuit', desc: 'Le bon dosage pour une soirée' },
      { n: 20, label: 'Underground', desc: 'Le marathon des âmes curieuses' },
    ];
    const T = state.themes;
    body.innerHTML = `
      <div class="frame">
        <h3>1 · Choisis ta course</h3>
        <div class="grid three">
          ${modes.map(m => `<button class="mode ${setup.size === m.n ? 'on' : ''}" data-size="${m.n}"><div class="num">${m.n}</div><div class="label">${m.label}</div><div class="desc">${m.desc}</div></button>`).join('')}
        </div>
        <h3 class="mt2">2 · Thèmes <span class="muted" style="font-family:var(--f-body);font-size:13px;font-weight:400">(aucun = tous les thèmes)</span></h3>
        <div class="chips">
          ${Object.entries(T).map(([k, t]) => `<button class="chip ${setup.themes.includes(k) ? 'on' : ''}" data-theme="${k}" style="--c:${t.color}">${t.icon} ${esc(t.label)}</button>`).join('')}
        </div>
        <div class="center mt2"><button class="btn green big" id="start">LANCER LA COURSE</button><p class="error" id="startErr"></p></div>
      </div>
      <div class="center mt2 noprint"><button class="btn-neon sm danger" id="endLink"><span>Rompre le lien</span></button></div>`;
    $$('[data-size]').forEach(b => b.onclick = () => { setup.size = +b.dataset.size; $$('[data-size]').forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-theme]').forEach(b => b.onclick = () => {
      const k = b.dataset.theme;
      setup.themes = setup.themes.includes(k) ? setup.themes.filter(x => x !== k) : [...setup.themes, k];
      b.classList.toggle('on');
    });
    $('#start').onclick = async () => {
      try { const g = await api(`/api/links/${link.id}/games`, { body: { size: setup.size, themes: setup.themes } }); go(`#/game/${g.id}`); }
      catch (e) { $('#startErr').textContent = e.message; }
    };
    bindEnd(link);
  }

  function bindEnd(link) {
    $('#endLink').onclick = () => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="frame modal center"><h3>Rompre le lien ?</h3>
        <p>La messagerie avec <b>${esc(link.other.pseudo)}</b> (textes, vocaux, photos) sera <b>définitivement effacée</b>. L’historique des parties est conservé.</p>
        <div class="row" style="justify-content:center"><button class="btn sm red" id="yesEnd">Rompre</button><button class="btn-neon sm" id="noEnd"><span>Annuler</span></button></div></div>`;
      document.body.appendChild(bg);
      $('#noEnd', bg).onclick = () => bg.remove();
      $('#yesEnd', bg).onclick = async () => { await api(`/api/links/${link.id}/end`, { method: 'POST' }); bg.remove(); go('#/'); };
    };
  }

  async function renderLinkGames(body, link) {
    const games = await api(`/api/links/${link.id}/games`);
    body.innerHTML = `<div class="frame">${gamesTable(games, false)}</div>`;
  }

  function gamesTable(games, withOther) {
    if (!games.length) return '<div class="empty">Aucune partie pour le moment.</div>';
    const st = g => g.status === 'active' ? '<span class="badge pulse">En cours</span>' : g.status === 'done' ? '<span class="badge amber">Terminée</span>' : '<span class="badge grey">Abandonnée</span>';
    const themes = g => g.themes.length ? g.themes.map(t => state.themes[t] ? state.themes[t].icon : '').join(' ') : '<span class="muted">Tous</span>';
    return `<div class="table-wrap"><table class="hist">
      <thead><tr><th>Date</th>${withOther ? '<th>Avec</th>' : ''}<th>Format</th><th>Thèmes</th><th>Statut</th><th>Score</th><th></th></tr></thead>
      <tbody>${games.map(g => `<tr>
        <td>${fmtDate(g.created_at)}</td>
        ${withOther ? `<td><div class="row">${avatar(g.other, 'sm')} ${esc(g.other.pseudo)} ${g.linkStatus !== 'active' ? '<span class="badge grey">lien rompu</span>' : ''}</div></td>` : ''}
        <td>${g.size} Q</td><td>${themes(g)}</td><td>${st(g)}</td>
        <td>${g.score && g.score.completed ? `<b class="rank ${g.score.rank.rarity}" style="font-size:16px">${g.score.score}%</b>` : '—'}</td>
        <td>${g.status === 'active' ? `<a class="btn-neon sm" href="#/game/${g.id}"><span>Reprendre</span></a>` : g.score && g.score.completed ? `<a class="btn-neon sm pink" href="#/report/${g.id}"><span>Rapport</span></a>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // =========================================================
  // PARTIE
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

  async function renderGame(soft = false) {
    // On préserve un brouillon de réponse en cours de frappe
    const ta = $('#answerText');
    if (ta) drafts[ta.dataset.key] = ta.value;

    const g = await api(`/api/games/${state.params.id}`);
    const me = g.players.find(p => p.id === g.me);
    const other = g.players.find(p => p.id !== g.me);
    const seenKey = `hd_seen_${g.id}`;
    let seen = store.get(seenKey, -1);
    const revealed = g.rounds.filter(r => r.revealed).length;
    const myCount = g.rounds.filter(r => r.mine).length;
    const otherCount = g.rounds.filter(r => r.revealed || (r.other && r.other.answered)).length;

    const lane = (p, n) => `<div class="lane"><span class="who">${esc(p.pseudo)}</span><div class="track"><i style="--c:${esc(p.color)};width:${(n / g.total) * 100}%"></i></div><span>${n}/${g.total}</span></div>`;
    const header = `
      <div class="row" style="margin-bottom:10px">
        <a class="btn-neon sm" href="#/link/${g.linkId}"><span>← Lien</span></a>
        <div class="spacer"></div>
        ${g.status === 'active' ? '<button class="btn-neon sm danger" id="abandon"><span>Abandonner</span></button>' : ''}
      </div>
      <div class="race">${lane(me, myCount)}${lane(other, otherCount)}</div>`;

    let content = '';
    // 1) Une manche révélée pas encore vue → écran de révélation
    if (revealed > 0 && seen < revealed - 1) {
      const idx = seen + 1;
      const r = g.rounds[idx];
      let banner;
      if (r.type === 'yesno') banner = r.mine.answer === r.other.answer
        ? '<div class="stylepts"><span>Perfect match</span><small>+1 SYNERGIE</small></div>'
        : '<div class="stylepts miss"><span>Duel d’opinions</span><small>LE DÉBAT EST OUVERT</small></div>';
      else banner = '<div class="stylepts"><span>Réponses dévoilées</span><small>À VOUS DE RACONTER</small></div>';
      const ans = a => r.type === 'yesno' ? `<span style="font-family:var(--f-title);font-size:34px;font-weight:900">${a.answer.toUpperCase()}</span>` : esc(a.answer);
      const isLast = idx === g.total - 1;
      content = `
        <p class="qline">« ${esc(r.question)} »</p>
        <div class="reveal">
          <div>${cardHtml({ num: idx + 1, round: r, img: r.mine, text: ans(r.mine), who: me.pseudo, whoColor: me.color, answer: true })}<div class="credit">${esc(r.mine.credit || '')}</div></div>
          <div class="mid">VS</div>
          <div>${cardHtml({ num: idx + 1, round: r, img: r.other, text: ans(r.other), who: other.pseudo, whoColor: other.color, answer: true })}<div class="credit">${esc(r.other.credit || '')}</div></div>
        </div>
        ${banner}
        <div class="center mt"><button class="btn green big" id="nextQ">${isLast ? 'VOIR LE RAPPORT' : 'QUESTION SUIVANTE'}</button></div>
        ${revealed - 1 - idx > 1 ? `<div class="center mt"><button class="btn-neon sm" id="skipAll"><span>Passer les ${revealed - 1 - idx} révélations suivantes</span></button></div>` : ''}`;
      app.innerHTML = header + content;
      $('#nextQ').onclick = () => { store.set(seenKey, idx); if (isLast) go(`#/report/${g.id}`); else renderGame(); };
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
        // 2) J'ai répondu, j'attends l'autre
        content = `
          <p class="qline">« ${esc(r.question)} »</p>
          <div class="reveal">
            <div>${cardHtml({ num: g.current + 1, round: r, img: r.mine, text: r.type === 'yesno' ? `<span style="font-family:var(--f-title);font-size:34px;font-weight:900">${r.mine.answer.toUpperCase()}</span>` : esc(r.mine.answer), who: me.pseudo, whoColor: me.color, answer: true })}</div>
            <div class="mid">VS</div>
            <div><div class="card facedown"><div class="back"><span class="logo">HEART<b>DRIVE</b></span></div><div class="who" style="--c:${esc(other.color)}">${esc(other.pseudo)}</div></div></div>
          </div>
          <div class="waiting"><span class="hourglass">⏳</span><br>En attente de ${esc(other.pseudo)}…</div>`;
      } else {
        // 3) À moi de répondre
        const key = `${g.id}-${g.current}`;
        content = `
          ${r.other.answered ? `<div class="center" style="margin-bottom:14px"><span class="badge pink pulse">${esc(other.pseudo)} a déjà répondu !</span></div>` : ''}
          ${cardHtml({ num: g.current + 1, round: r, text: esc(r.question) })}
          <div class="answer-zone">
            ${r.type === 'yesno'
              ? `<div class="yesno"><button class="btn green" data-yn="oui">OUI</button><button class="btn red" data-yn="non">NON</button></div>`
              : `<form id="ansForm"><textarea class="input" id="answerText" data-key="${key}" maxlength="500" placeholder="Ta réponse… (une image sera trouvée automatiquement pour l’illustrer)" required>${esc(drafts[key] || '')}</textarea>
                 <div class="center mt"><button class="btn green big" type="submit">JOUER LA CARTE</button></div></form>`}
            <p class="error center" id="ansErr"></p>
          </div>`;
      }
    }

    // Manches passées
    const past = g.rounds.filter(r => r.revealed && r.idx <= seen);
    if (past.length) {
      content += `<h2 class="hud pink mt2" style="font-size:20px">Manches précédentes</h2><div class="rounds-strip">${past.map(r => `
        <div class="mini" style="--c:${esc(r.color)}">
          <div class="imgs">
            <div>${r.mine.thumb ? `<img src="${esc(r.mine.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : r.icon}</div>
            <div>${r.other.thumb ? `<img src="${esc(r.other.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : r.icon}</div>
          </div>
          <div class="body"><div class="q">${r.icon} ${esc(r.question)}</div>
            <div><b style="color:${esc(me.color)}">${esc(me.pseudo)} :</b> ${esc(r.mine.answer)}</div>
            <div><b style="color:${esc(other.color)}">${esc(other.pseudo)} :</b> ${esc(r.other.answer)}</div>
          </div>
        </div>`).join('')}</div>`;
    }

    app.innerHTML = header + content;
    if (!soft) window.scrollTo(0, 0);
    bindAbandon(g);

    const submit = async answer => {
      try { await api(`/api/games/${g.id}/answer`, { body: { idx: g.current, answer } }); delete drafts[`${g.id}-${g.current}`]; renderGame(); }
      catch (e) { $('#ansErr').textContent = e.message; }
    };
    $$('[data-yn]').forEach(b => b.onclick = () => { $$('[data-yn]').forEach(x => x.disabled = true); submit(b.dataset.yn); });
    const form = $('#ansForm');
    if (form) {
      const t = $('#answerText');
      t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      t.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
      form.onsubmit = e => { e.preventDefault(); const v = t.value.trim(); if (v) { form.querySelector('button').disabled = true; submit(v); } };
    }
  }

  function bindAbandon(g) {
    const b = $('#abandon');
    if (b) b.onclick = async () => { if (confirmInline(b)) { await api(`/api/games/${g.id}/abandon`, { method: 'POST' }); renderGame(); } };
  }
  // Double-clic de confirmation (évite les boîtes de dialogue bloquantes)
  function confirmInline(btn) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    btn.querySelector('span').textContent = 'Confirmer ?';
    setTimeout(() => { delete btn.dataset.armed; const s = btn.querySelector('span'); if (s) s.textContent = 'Abandonner'; }, 3000);
    return false;
  }

  // =========================================================
  // RAPPORT
  // =========================================================
  async function renderReport() {
    const r = await api(`/api/games/${state.params.id}/report`);
    const [a, b] = r.players;
    const me = r.players.find(p => p.id === state.me.id) || a;
    const other = r.players.find(p => p.id !== me.id) || b;
    const rarityColor = { legendary: '#ffa500', epic: '#a335ee', rare: '#0070dd', common: '#9d9d9d' }[r.rank.rarity];
    const statOf = p => r.stats.find(s => s.id === p.id);
    const img = (ans, round) => `<div class="img" style="--c:${esc(round.color)}">${ans && ans.thumb ? `<img src="${esc(ans.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : round.icon}</div>`;
    const verdict = x => x.type === 'yesno' ? (x.match ? '<span class="badge">Match</span>' : x.complete ? '<span class="badge pink">Duel</span>' : '') : x.echo ? '<span class="badge amber">Même longueur d’onde</span>' : '';

    app.innerHTML = `
      <div class="row noprint" style="margin-bottom:10px">
        <a class="btn-neon sm" href="#/link/${r.game.linkId}/games"><span>← Parties</span></a>
        <div class="spacer"></div>
        <button class="btn-neon sm pink" onclick="window.print()"><span>Imprimer / PDF</span></button>
      </div>
      <h1 class="hud">Rapport de course</h1>
      <p class="sub">${esc(me.pseudo)} × ${esc(other.pseudo)} · ${fmtDate(r.game.created_at)} · ${r.completed}/${r.game.size} manches ${r.game.status === 'abandoned' ? '· <span class="badge grey">abandonnée</span>' : ''}</p>

      <div class="grid two">
        <div class="frame center">
          <div class="score-ring" style="--p:${r.score};--c:${rarityColor}"><b>${r.score}<small>%</small></b></div>
          <div class="rank ${r.rank.rarity}">${esc(r.rank.name)}</div>
          <p class="muted">${r.yesTotal ? `${r.yesMatch}/${r.yesTotal} réponses oui/non identiques` : 'Pas de question oui/non dans cette partie'}${r.echoes ? ` · ${r.echoes} écho(s) dans les réponses libres` : ''}</p>
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
              <div class="stat"><div class="row" style="justify-content:center">${avatar(p, 'sm')} <b style="font-size:16px;color:#fff;text-shadow:none">${esc(p.pseudo)}</b></div>
                <b>${s.avgSeconds < 60 ? s.avgSeconds + 's' : Math.round(s.avgSeconds / 60) + 'min'}</b><span class="muted">temps moyen</span>
                <b>${s.yes}</b><span class="muted">« oui » donnés</span></div>`; }).join('')}
          </div>
        </div>
      </div>

      <h2 class="hud pink mt2">Toutes les manches</h2>
      <div class="list">
        ${r.rounds.filter(x => x.complete).map((x, i) => `
          <div class="rep-round">
            <div class="q"><span style="font-family:var(--f-hud);color:var(--gold)">#${i + 1}</span> ${x.icon} ${esc(x.question)} <div class="spacer"></div>${verdict(x)}</div>
            ${[me, other].map(p => `<div class="rep-ans">${img(x.answers[p.id], x)}<div><div class="pseudo" style="color:${esc(p.color)}">${esc(p.pseudo)}</div><div>${esc(x.answers[p.id] ? x.answers[p.id].answer : '—')}</div></div></div>`).join('')}
          </div>`).join('') || '<div class="empty">Aucune manche complète.</div>'}
      </div>`;
  }

  // =========================================================
  // HISTORIQUE GLOBAL
  // =========================================================
  async function renderHistory() {
    const games = await api('/api/history');
    const done = games.filter(g => g.score && g.score.completed);
    const avg = done.length ? Math.round(done.reduce((s, g) => s + g.score.score, 0) / done.length) : 0;
    app.innerHTML = `
      <h1 class="hud">Historique des courses</h1>
      <div class="grid three" style="margin-bottom:18px">
        <div class="stat"><b>${games.length}</b><span class="muted">parties</span></div>
        <div class="stat"><b>${games.filter(g => g.status === 'done').length}</b><span class="muted">terminées</span></div>
        <div class="stat"><b>${avg}%</b><span class="muted">synergie moyenne</span></div>
      </div>
      <div class="frame">${gamesTable(games, true)}</div>`;
  }

  // =========================================================
  // MESSAGERIE : texte, vocal (10 s max), photo
  // =========================================================
  const chat = (() => {
    let link = null, root = null, msgs = [], rec = null;

    function stop() { if (rec) rec.cancel(); link = null; root = null; }

    async function start(body, l) {
      link = l; root = body; msgs = [];
      body.innerHTML = `
        <div class="frame chat">
          <div class="msgs" id="msgs"><div class="empty">Chargement…</div></div>
          <div class="typing" id="typing"></div>
          <form class="bar" id="chatForm">
            <button type="button" class="iconbtn" id="photoBtn" title="Envoyer une photo">📷</button>
            <input type="file" id="photoIn" accept="image/*" hidden>
            <div class="spacer" id="composer" style="display:flex;gap:8px;align-items:center">
              <input class="input" id="chatIn" placeholder="Écris un message…" maxlength="2000" autocomplete="off">
            </div>
            <button type="button" class="iconbtn" id="micBtn" title="Message vocal (10 s max)">🎙️</button>
            <button type="submit" class="iconbtn" title="Envoyer">➤</button>
          </form>
        </div>
        <p class="muted center" style="font-size:12px">Les messages, vocaux et photos sont conservés tant que le lien est actif.</p>`;
      const list = await api(`/api/links/${l.id}/messages`);
      if (link !== l) return;
      msgs = list;
      draw(true);

      const input = $('#chatIn');
      let lastTyping = 0;
      input.oninput = () => { if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); state.socket.emit('typing', { linkId: l.id }); } };
      $('#chatForm').onsubmit = async e => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        input.value = '';
        const fd = new FormData(); fd.append('kind', 'text'); fd.append('body', v);
        try { await api(`/api/links/${l.id}/messages`, { body: fd }); } catch (err) { toast(esc(err.message)); input.value = v; }
      };
      $('#photoBtn').onclick = () => $('#photoIn').click();
      $('#photoIn').onchange = async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try {
          const blob = await downscale(f);
          const fd = new FormData(); fd.append('kind', 'photo'); fd.append('file', blob, 'photo.jpg');
          await api(`/api/links/${l.id}/messages`, { body: fd });
        } catch (err) { toast(esc(err.message || 'Envoi impossible')); }
      };
      $('#micBtn').onclick = () => (rec ? rec.stop() : record(l));
      input.focus();
    }

    function add(m) {
      if (!link || m.linkId !== link.id || msgs.some(x => x.id === m.id)) return;
      msgs.push(m);
      draw(true);
      const ty = $('#typing'); if (ty && m.sender !== state.me.id) ty.textContent = '';
    }

    function draw(scroll) {
      const box = $('#msgs');
      if (!box) return;
      if (!msgs.length) { box.innerHTML = `<div class="empty">Aucun message. Lance la conversation avec ${esc(link.other.pseudo)} !</div>`; return; }
      let lastDay = '';
      box.innerHTML = msgs.map(m => {
        const day = fmtDay(m.created_at);
        const sep = day !== lastDay ? `<div class="daysep">${day}</div>` : '';
        lastDay = day;
        const mine = m.sender === state.me.id;
        let inner = '';
        if (m.kind === 'text') inner = esc(m.body).replace(/\n/g, '<br>');
        if (m.kind === 'photo') inner = `<img src="${esc(m.url)}" alt="photo" data-zoom loading="lazy">${m.body ? `<div>${esc(m.body)}</div>` : ''}`;
        if (m.kind === 'voice') inner = `<div class="vtag">🎙️ VOCAL · ${Math.round(m.duration || 0)} s</div><audio controls preload="metadata" src="${esc(m.url)}"></audio>`;
        return `${sep}<div class="msg ${mine ? 'me' : 'them'}">${inner}<div class="time">${fmtTime(m.created_at)}</div></div>`;
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
      composer.innerHTML = `<div class="recbar"><span class="pulse">● REC</span><div class="track"><i id="recProg" style="--c:var(--red);width:0"></i></div><span id="recSec">0s</span><button type="button" class="btn-neon sm danger" id="recCancel"><span>✖</span></button></div>`;
      $('#micBtn').classList.add('rec');
      $('#micBtn').textContent = '■';
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
        const mic = $('#micBtn'); if (mic) { mic.classList.remove('rec'); mic.textContent = '🎙️'; }
        if (composer.isConnected) { composer.innerHTML = saved; const inp = $('#chatIn'); if (inp) { inp.oninput = () => state.socket.emit('typing', { linkId: l.id }); } }
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

    // Réduit les photos (max 1600 px) avant l'envoi
    function downscale(file) {
      return new Promise((resolve) => {
        if (!/^image\/(jpeg|png|webp)/.test(file.type)) return resolve(file);
        const img = new Image();
        img.onload = () => {
          const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(b => resolve(b || file), 'image/jpeg', 0.85);
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      });
    }

    return { start, add, stop };
  })();

  render();
})();
