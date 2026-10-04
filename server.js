const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { Server } = require('socket.io');

const { db, UPLOAD_DIR } = require('./src/db');
const { THEMES, QUESTIONS } = require('./src/questions');
const { findImage } = require('./src/images');
const { buildReport, QMAP } = require('./src/report');

const PORT = process.env.PORT || 3000;
const COOKIE = 'hd_token';
const now = () => Date.now();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth ----------
const hash = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');
const COLORS = ['#00e5ff', '#ff2fd6', '#39ff14', '#ffb400', '#7b5cff', '#ff5a36', '#2fd4ff', '#ff4f8b'];

const pub = u => u && ({ id: u.id, pseudo: u.pseudo, color: u.color, bio: u.bio || '', avatar: u.avatar ? `/avatar/${u.avatar}` : null });
const getUser = id => pub(db.prepare('SELECT * FROM users WHERE id = ?').get(id));

function userFromToken(token) {
  if (!token) return null;
  return pub(db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token));
}
function auth(req, res, next) {
  const u = userFromToken(req.cookies[COOKIE]);
  if (!u) return res.status(401).json({ error: 'Non connecté' });
  req.user = u;
  next();
}
function startSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, userId, now());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 180 });
}
const validPseudo = p => typeof p === 'string' && /^[\p{L}\p{N}_.\- ]{2,20}$/u.test(p.trim());

app.post('/api/register', (req, res) => {
  const pseudo = String(req.body.pseudo || '').trim();
  const pin = String(req.body.pin || '');
  if (!validPseudo(pseudo)) return res.status(400).json({ error: 'Pseudo invalide (2 à 20 caractères, lettres/chiffres/_.-)' });
  if (pin.length < 4) return res.status(400).json({ error: 'Le code secret doit faire au moins 4 caractères' });
  if (db.prepare('SELECT 1 FROM users WHERE pseudo = ?').get(pseudo)) return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
  const salt = crypto.randomBytes(16).toString('hex');
  const color = COLORS[db.prepare('SELECT COUNT(*) n FROM users').get().n % COLORS.length];
  const info = db.prepare('INSERT INTO users (pseudo, pass_hash, salt, color, created_at) VALUES (?,?,?,?,?)').run(pseudo, hash(pin, salt), salt, color, now());
  startSession(res, info.lastInsertRowid);
  res.json(getUser(info.lastInsertRowid));
});

app.post('/api/login', (req, res) => {
  const pseudo = String(req.body.pseudo || '').trim();
  const pin = String(req.body.pin || '');
  const u = db.prepare('SELECT * FROM users WHERE pseudo = ?').get(pseudo);
  if (!u || !crypto.timingSafeEqual(Buffer.from(hash(pin, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex')))
    return res.status(401).json({ error: 'Pseudo ou code secret incorrect' });
  startSession(res, u.id);
  res.json(pub(u));
});

app.post('/api/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies[COOKIE] || '');
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

// ---------- Profil ----------
function notifyLinked(uid) {
  db.prepare("SELECT * FROM links WHERE (user_a = ? OR user_b = ?) AND status IN ('pending','active')").all(uid, uid)
    .forEach(l => emitTo(otherOf(l, uid), 'links', { linkId: l.id }));
}

app.patch('/api/me', auth, (req, res) => {
  const uid = req.user.id;
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  const pseudo = req.body.pseudo != null ? String(req.body.pseudo).trim() : cur.pseudo;
  const color = /^#[0-9a-f]{6}$/i.test(req.body.color || '') ? req.body.color : cur.color;
  const bio = req.body.bio != null ? String(req.body.bio).trim().slice(0, 160) : cur.bio;
  if (!validPseudo(pseudo)) return res.status(400).json({ error: 'Pseudo invalide (2 à 20 caractères, lettres/chiffres/_.-)' });
  const taken = db.prepare('SELECT id FROM users WHERE pseudo = ? AND id != ?').get(pseudo, uid);
  if (taken) return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
  db.prepare('UPDATE users SET pseudo = ?, color = ?, bio = ? WHERE id = ?').run(pseudo, color, bio, uid);
  notifyLinked(uid);
  res.json(getUser(uid));
});

app.post('/api/me/pin', auth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const current = String(req.body.current || ''), next = String(req.body.next || '');
  if (!crypto.timingSafeEqual(Buffer.from(hash(current, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex')))
    return res.status(401).json({ error: 'Code secret actuel incorrect' });
  if (next.length < 4) return res.status(400).json({ error: 'Le nouveau code doit faire au moins 4 caractères' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash(next, salt), salt, u.id);
  res.json({ ok: true });
});
app.get('/api/themes', (req, res) => res.json(THEMES));

// ---------- Présence & temps réel ----------
const online = new Map(); // userId -> nb de sockets
const emitTo = (userId, evt, data) => io.to(`user:${userId}`).emit(evt, data);
const otherOf = (link, uid) => (link.user_a === uid ? link.user_b : link.user_a);

io.use((socket, next) => {
  const raw = socket.handshake.headers.cookie || '';
  const token = (raw.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '=')) || '').split('=')[1];
  const u = userFromToken(token);
  if (!u) return next(new Error('unauthorized'));
  socket.user = u;
  next();
});

io.on('connection', socket => {
  const uid = socket.user.id;
  socket.join(`user:${uid}`);
  online.set(uid, (online.get(uid) || 0) + 1);
  broadcastPresence(uid);
  socket.on('typing', ({ linkId }) => {
    const link = getLink(linkId, uid);
    if (link && link.status === 'active') emitTo(otherOf(link, uid), 'typing', { linkId: link.id, from: uid });
  });
  socket.on('disconnect', () => {
    const n = (online.get(uid) || 1) - 1;
    if (n <= 0) online.delete(uid); else online.set(uid, n);
    broadcastPresence(uid);
  });
});

function broadcastPresence(uid) {
  const links = db.prepare("SELECT * FROM links WHERE (user_a = ? OR user_b = ?) AND status = 'active'").all(uid, uid);
  for (const l of links) emitTo(otherOf(l, uid), 'presence', { userId: uid, online: online.has(uid) });
}

// ---------- Links ----------
function getLink(id, uid) {
  const l = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
  if (!l || (l.user_a !== uid && l.user_b !== uid)) return null;
  return l;
}
const side = (l, uid) => (l.user_a === uid ? 'a' : 'b');
function linkView(l, uid) {
  const otherId = otherOf(l, uid);
  const other = getUser(otherId);
  const me = side(l, uid);
  const unread = db.prepare('SELECT COUNT(*) n FROM messages WHERE link_id = ? AND sender_id != ? AND id > ?').get(l.id, uid, l['read_' + me]).n;
  const activeGame = db.prepare("SELECT id, size FROM games WHERE link_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(l.id);
  const gamesCount = db.prepare("SELECT COUNT(*) n FROM games WHERE link_id = ? AND status = 'done'").get(l.id).n;
  const lastMsg = db.prepare('SELECT kind, body, sender_id, created_at FROM messages WHERE link_id = ? ORDER BY id DESC LIMIT 1').get(l.id);
  return {
    id: l.id, status: l.status, created_at: l.created_at, activated_at: l.activated_at,
    incoming: l.status === 'pending' && l.requested_by !== uid,
    label: l['label_' + me] || '',
    other: { ...other, online: online.has(otherId) },
    activeGame: activeGame || null, gamesCount, lastMsg: lastMsg || null, unread,
  };
}

app.get('/api/links', auth, (req, res) => {
  const uid = req.user.id;
  const rows = db.prepare("SELECT * FROM links WHERE (user_a = ? OR user_b = ?) AND status IN ('pending','active') ORDER BY COALESCE(activated_at, created_at) DESC").all(uid, uid);
  res.json(rows.map(l => linkView(l, uid)));
});

app.get('/api/links/:id', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l) return res.status(404).json({ error: 'Lien introuvable' });
  res.json(linkView(l, req.user.id));
});

app.post('/api/links', auth, (req, res) => {
  const uid = req.user.id;
  const target = db.prepare('SELECT id, pseudo FROM users WHERE pseudo = ?').get(String(req.body.pseudo || '').trim());
  if (!target) return res.status(404).json({ error: "Aucun pilote avec ce pseudo. Elle/il doit d'abord créer son compte." });
  if (target.id === uid) return res.status(400).json({ error: 'Tu ne peux pas te lier avec toi-même 😉' });
  const existing = db.prepare("SELECT * FROM links WHERE ((user_a=? AND user_b=?) OR (user_a=? AND user_b=?)) AND status IN ('pending','active')").get(uid, target.id, target.id, uid);
  if (existing) {
    if (existing.status === 'pending' && existing.requested_by !== uid) {
      db.prepare("UPDATE links SET status='active', activated_at=? WHERE id=?").run(now(), existing.id);
      notifyLink(existing.id);
    }
    return res.json(linkView(getLink(existing.id, uid), uid));
  }
  const info = db.prepare('INSERT INTO links (user_a, user_b, requested_by, status, created_at) VALUES (?,?,?,?,?)').run(uid, target.id, uid, 'pending', now());
  notifyLink(info.lastInsertRowid);
  res.json(linkView(getLink(info.lastInsertRowid, uid), uid));
});

app.patch('/api/links/:id', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l) return res.status(404).json({ error: 'Lien introuvable' });
  const label = String(req.body.label || '').trim().slice(0, 40);
  db.prepare(`UPDATE links SET label_${side(l, req.user.id)} = ? WHERE id = ?`).run(label || null, l.id);
  res.json(linkView(getLink(l.id, req.user.id), req.user.id));
});

app.post('/api/links/:id/read', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l) return res.status(404).json({ error: 'Lien introuvable' });
  const last = db.prepare('SELECT MAX(id) m FROM messages WHERE link_id = ?').get(l.id).m || 0;
  const col = 'read_' + side(l, req.user.id);
  db.prepare(`UPDATE links SET ${col} = MAX(${col}, ?) WHERE id = ?`).run(last, l.id);
  res.json({ ok: true });
});

function notifyLink(linkId) {
  const l = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId);
  [l.user_a, l.user_b].forEach(u => emitTo(u, 'links', { linkId }));
}

app.post('/api/links/:id/accept', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l || l.status !== 'pending' || l.requested_by === req.user.id) return res.status(400).json({ error: 'Invitation invalide' });
  db.prepare("UPDATE links SET status='active', activated_at=? WHERE id=?").run(now(), l.id);
  notifyLink(l.id);
  res.json(linkView(getLink(l.id, req.user.id), req.user.id));
});

app.post('/api/links/:id/decline', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l || l.status !== 'pending') return res.status(400).json({ error: 'Invitation invalide' });
  db.prepare("UPDATE links SET status='declined', ended_at=? WHERE id=?").run(now(), l.id);
  notifyLink(l.id);
  res.json({ ok: true });
});

// Rompre le lien : la messagerie (textes, vocaux, photos) est effacée, l'historique des parties est conservé.
app.post('/api/links/:id/end', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l || l.status !== 'active') return res.status(400).json({ error: 'Lien non actif' });
  const files = db.prepare('SELECT file_name FROM messages WHERE link_id = ? AND file_name IS NOT NULL').all(l.id);
  for (const f of files) fs.rm(path.join(UPLOAD_DIR, f.file_name), { force: true }, () => {});
  db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE link_id = ?').run(l.id);
    db.prepare("UPDATE games SET status='abandoned', finished_at=? WHERE link_id=? AND status='active'").run(now(), l.id);
    db.prepare("UPDATE links SET status='ended', ended_at=? WHERE id=?").run(now(), l.id);
  })();
  notifyLink(l.id);
  res.json({ ok: true });
});

// ---------- Parties ----------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function pickQuestions(linkId, size, themes) {
  const played = new Set();
  db.prepare('SELECT question_ids FROM games WHERE link_id = ?').all(linkId).forEach(g => JSON.parse(g.question_ids).forEach(id => played.add(id)));
  const inThemes = q => !themes.length || themes.includes(q.theme);
  const tiers = [
    QUESTIONS.filter(q => inThemes(q) && !played.has(q.id)),
    QUESTIONS.filter(q => inThemes(q) && played.has(q.id)),
    QUESTIONS.filter(q => !inThemes(q) && !played.has(q.id)),
    QUESTIONS.filter(q => !inThemes(q) && played.has(q.id)),
  ];
  const chosen = [];
  for (const tier of tiers) {
    // Répartition équilibrée entre thèmes : on mélange puis on alterne les thèmes
    const byTheme = {};
    shuffle([...tier]).forEach(q => (byTheme[q.theme] = byTheme[q.theme] || []).push(q));
    const keys = shuffle(Object.keys(byTheme));
    while (chosen.length < size && keys.some(k => byTheme[k].length)) {
      for (const k of keys) { if (chosen.length >= size) break; const q = byTheme[k].shift(); if (q) chosen.push(q); }
    }
    if (chosen.length >= size) break;
  }
  // Un minimum de mix oui/non & libre
  return shuffle(chosen).map(q => q.id);
}

function gamePlayers(game) {
  const l = db.prepare('SELECT * FROM links WHERE id = ?').get(game.link_id);
  return [l.user_a, l.user_b].map(getUser);
}
function getGame(id, uid) {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(Number(id));
  if (!g) return null;
  const l = db.prepare('SELECT * FROM links WHERE id = ?').get(g.link_id);
  if (l.user_a !== uid && l.user_b !== uid) return null;
  g.link = l;
  return g;
}

// Vue d'une partie pour un joueur : on ne révèle jamais la réponse de l'autre avant d'avoir répondu soi-même.
function gameView(g, uid) {
  const qids = JSON.parse(g.question_ids);
  const players = gamePlayers(g);
  const otherId = otherOf(g.link, uid);
  const answers = db.prepare('SELECT * FROM answers WHERE game_id = ?').all(g.id);
  const at = (idx, u) => answers.find(a => a.idx === idx && a.user_id === u);
  let current = 0;
  while (current < qids.length && at(current, uid) && at(current, otherId)) current++;
  const rounds = [];
  for (let idx = 0; idx <= Math.min(current, qids.length - 1); idx++) {
    const q = QMAP.get(qids[idx]);
    const mine = at(idx, uid), theirs = at(idx, otherId);
    const pub = a => a && { answer: a.answer, image: a.image_url, thumb: a.image_thumb, credit: a.image_credit, imageStatus: a.image_status };
    rounds.push({
      idx, question: q.q, type: q.type, theme: q.theme, themeLabel: THEMES[q.theme].label, icon: THEMES[q.theme].icon, color: THEMES[q.theme].color,
      mine: pub(mine),
      other: mine && theirs ? pub(theirs) : { answered: !!theirs, hidden: true },
      revealed: !!(mine && theirs),
    });
  }
  return { id: g.id, linkId: g.link_id, size: g.size, status: g.status, themes: JSON.parse(g.themes), created_at: g.created_at, finished_at: g.finished_at, current, total: qids.length, players, me: uid, otherId, rounds };
}

function notifyGame(g) {
  [g.link.user_a, g.link.user_b].forEach(u => emitTo(u, 'game', { gameId: g.id, linkId: g.link_id }));
}

app.get('/api/links/:id/games', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l) return res.status(404).json({ error: 'Lien introuvable' });
  res.json(listGames('g.link_id = ?', [l.id], req.user.id));
});

app.post('/api/links/:id/games', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l || l.status !== 'active') return res.status(400).json({ error: 'Le lien doit être actif pour lancer une partie' });
  const active = db.prepare("SELECT * FROM games WHERE link_id = ? AND status = 'active'").get(l.id);
  if (active) return res.json({ id: active.id, existing: true });
  const size = [5, 10, 20].includes(Number(req.body.size)) ? Number(req.body.size) : 10;
  const themes = (Array.isArray(req.body.themes) ? req.body.themes : []).filter(t => THEMES[t]);
  const qids = pickQuestions(l.id, size, themes);
  const info = db.prepare('INSERT INTO games (link_id, size, themes, question_ids, status, created_by, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(l.id, size, JSON.stringify(themes), JSON.stringify(qids), 'active', req.user.id, now());
  const g = getGame(info.lastInsertRowid, req.user.id);
  notifyGame(g);
  res.json({ id: g.id });
});

app.get('/api/games/:id', auth, (req, res) => {
  const g = getGame(req.params.id, req.user.id);
  if (!g) return res.status(404).json({ error: 'Partie introuvable' });
  res.json(gameView(g, req.user.id));
});

app.post('/api/games/:id/answer', auth, (req, res) => {
  const uid = req.user.id;
  const g = getGame(req.params.id, uid);
  if (!g || g.status !== 'active') return res.status(400).json({ error: 'Partie non active' });
  const view = gameView(g, uid);
  const idx = Number(req.body.idx);
  if (idx !== view.current) return res.status(409).json({ error: "Attends que l'autre ait répondu avant de passer à la suite" });
  const qid = JSON.parse(g.question_ids)[idx];
  const q = QMAP.get(qid);
  let answer = String(req.body.answer || '').trim().slice(0, 500);
  if (q.type === 'yesno') answer = answer.toLowerCase() === 'oui' ? 'oui' : answer.toLowerCase() === 'non' ? 'non' : '';
  if (!answer) return res.status(400).json({ error: 'Réponse vide' });
  try {
    db.prepare('INSERT INTO answers (game_id, idx, user_id, answer, created_at) VALUES (?,?,?,?,?)').run(g.id, idx, uid, answer, now());
  } catch (e) {
    return res.status(409).json({ error: 'Tu as déjà répondu à cette question' });
  }
  // Fin de partie ?
  const both = db.prepare('SELECT COUNT(*) n FROM answers WHERE game_id = ? AND idx = ?').get(g.id, idx).n === 2;
  if (both && idx === g.size - 1) db.prepare("UPDATE games SET status='done', finished_at=? WHERE id=?").run(now(), g.id);
  notifyGame(g);
  res.json(gameView(getGame(g.id, uid), uid));

  // Recherche d'image en tâche de fond
  findImage(answer, q).then(img => {
    db.prepare('UPDATE answers SET image_url=?, image_thumb=?, image_credit=?, image_status=? WHERE game_id=? AND idx=? AND user_id=?')
      .run(img ? img.url : null, img ? img.thumb : null, img ? img.credit : null, img ? 'ok' : 'none', g.id, idx, uid);
    notifyGame(g);
  }).catch(() => {
    db.prepare("UPDATE answers SET image_status='none' WHERE game_id=? AND idx=? AND user_id=?").run(g.id, idx, uid);
    notifyGame(g);
  });
});

app.post('/api/games/:id/abandon', auth, (req, res) => {
  const g = getGame(req.params.id, req.user.id);
  if (!g || g.status !== 'active') return res.status(400).json({ error: 'Partie non active' });
  db.prepare("UPDATE games SET status='abandoned', finished_at=? WHERE id=?").run(now(), g.id);
  notifyGame(g);
  res.json({ ok: true });
});

app.get('/api/games/:id/report', auth, (req, res) => {
  const g = getGame(req.params.id, req.user.id);
  if (!g) return res.status(404).json({ error: 'Partie introuvable' });
  if (g.status === 'active') return res.status(400).json({ error: 'Le rapport sera disponible à la fin de la partie' });
  const answers = db.prepare('SELECT * FROM answers WHERE game_id = ?').all(g.id);
  res.json(buildReport(g, gamePlayers(g), answers));
});

function listGames(where, params, uid) {
  const rows = db.prepare(`SELECT g.* FROM games g JOIN links l ON l.id = g.link_id WHERE ${where} ORDER BY g.id DESC`).all(...params);
  return rows.map(g => {
    g.link = db.prepare('SELECT * FROM links WHERE id = ?').get(g.link_id);
    const players = gamePlayers(g);
    let score = null;
    if (g.status !== 'active') {
      const r = buildReport(g, players, db.prepare('SELECT * FROM answers WHERE game_id = ?').all(g.id));
      score = { score: r.score, rank: r.rank, completed: r.completed };
    }
    const answered = db.prepare('SELECT COUNT(*) n FROM answers WHERE game_id = ?').get(g.id).n;
    return { id: g.id, linkId: g.link_id, linkStatus: g.link.status, size: g.size, status: g.status, themes: JSON.parse(g.themes), created_at: g.created_at, finished_at: g.finished_at, other: players.find(p => p.id !== uid), answered, score };
  });
}

app.get('/api/history', auth, (req, res) => {
  res.json(listGames('(l.user_a = ? OR l.user_b = ?)', [req.user.id, req.user.id], req.user.id));
});

// ---------- Messagerie ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = (file.mimetype.split('/')[1] || 'bin').split(';')[0].replace(/[^a-z0-9]/gi, '').slice(0, 5);
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^(image|audio)\//.test(file.mimetype)),
});

// Photo de profil
app.post('/api/me/avatar', auth, upload.single('file'), (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); return res.status(400).json({ error: 'Image invalide' }); }
  const old = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id).avatar;
  if (old) fs.rm(path.join(UPLOAD_DIR, old), { force: true }, () => {});
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, req.user.id);
  notifyLinked(req.user.id);
  res.json(getUser(req.user.id));
});
app.delete('/api/me/avatar', auth, (req, res) => {
  const old = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id).avatar;
  if (old) fs.rm(path.join(UPLOAD_DIR, old), { force: true }, () => {});
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  notifyLinked(req.user.id);
  res.json(getUser(req.user.id));
});
app.get('/avatar/:file', auth, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE avatar = ?').get(req.params.file);
  if (!u) return res.sendStatus(404);
  res.set('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(UPLOAD_DIR, req.params.file));
});

const msgView = m => ({ id: m.id, linkId: m.link_id, sender: m.sender_id, kind: m.kind, body: m.body, url: m.file_name ? `/media/${m.file_name}` : null, duration: m.duration, created_at: m.created_at });

app.get('/api/links/:id/messages', auth, (req, res) => {
  const l = getLink(req.params.id, req.user.id);
  if (!l || l.status !== 'active') return res.status(404).json({ error: 'Lien non actif' });
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.prepare('SELECT * FROM messages WHERE link_id = ? AND id < ? ORDER BY id DESC LIMIT 60').all(l.id, before);
  res.json(rows.reverse().map(msgView));
});

app.post('/api/links/:id/messages', auth, upload.single('file'), (req, res) => {
  const cleanup = () => req.file && fs.rm(req.file.path, { force: true }, () => {});
  const l = getLink(req.params.id, req.user.id);
  if (!l || l.status !== 'active') { cleanup(); return res.status(400).json({ error: 'Lien non actif' }); }
  const kind = req.body.kind;
  let body = null, file = null, mime = null, duration = null;
  if (kind === 'text') {
    body = String(req.body.body || '').trim().slice(0, 2000);
    if (!body) return res.status(400).json({ error: 'Message vide' });
  } else if (kind === 'photo') {
    if (!req.file || !req.file.mimetype.startsWith('image/')) { cleanup(); return res.status(400).json({ error: 'Image invalide' }); }
    file = req.file.filename; mime = req.file.mimetype;
    body = String(req.body.body || '').trim().slice(0, 300) || null;
  } else if (kind === 'voice') {
    if (!req.file || !req.file.mimetype.startsWith('audio/')) { cleanup(); return res.status(400).json({ error: 'Audio invalide' }); }
    duration = Math.min(10, Math.max(0, Number(req.body.duration) || 0));
    if (req.file.size > 1.5 * 1024 * 1024) { cleanup(); return res.status(400).json({ error: 'Message vocal trop long (10 s max)' }); }
    file = req.file.filename; mime = req.file.mimetype;
  } else { cleanup(); return res.status(400).json({ error: 'Type de message inconnu' }); }
  const info = db.prepare('INSERT INTO messages (link_id, sender_id, kind, body, file_name, mime, duration, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(l.id, req.user.id, kind, body, file, mime, duration, now());
  const m = msgView(db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid));
  [l.user_a, l.user_b].forEach(u => emitTo(u, 'message', m));
  res.json(m);
});

// Les médias ne sont servis qu'aux deux membres d'un lien actif
app.get('/media/:file', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE file_name = ?').get(req.params.file);
  if (!m) return res.sendStatus(404);
  const l = getLink(m.link_id, req.user.id);
  if (!l || l.status !== 'active') return res.sendStatus(403);
  res.type(m.mime.split(';')[0]);
  res.sendFile(path.join(UPLOAD_DIR, m.file_name));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Fichier trop lourd (8 Mo max)' });
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

app.get(/^\/(?!api|media|avatar|socket\.io).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => console.log(`🏁 HEARTDRIVE en piste sur http://localhost:${PORT}`));
