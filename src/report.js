const { THEMES, QUESTIONS } = require('./questions');
const { keywords } = require('./images');

const QMAP = new Map(QUESTIONS.map(q => [q.id, q]));

const stems = t => new Set(keywords(t, 20).split(' ').filter(Boolean).map(w => w.normalize('NFD').replace(/\p{Diacritic}/gu, '').slice(0, 5)));

function compare(type, a, b) {
  if (a == null || b == null) return { match: null, echo: false };
  if (type === 'yesno') return { match: a === b, echo: false };
  const sa = stems(a), sb = stems(b);
  const echo = [...sa].some(w => sb.has(w));
  return { match: null, echo };
}

function rankFor(score) {
  if (score >= 85) return { name: 'Âmes sœurs légendaires', rarity: 'legendary' };
  if (score >= 65) return { name: 'Duo épique', rarity: 'epic' };
  if (score >= 45) return { name: 'Belle équipe', rarity: 'rare' };
  return { name: 'Opposés qui s’attirent', rarity: 'common' };
}

/**
 * Construit le rapport complet d'une partie.
 */
function buildReport(game, players, answers) {
  const qids = JSON.parse(game.question_ids);
  const byIdx = {};
  for (const a of answers) (byIdx[a.idx] = byIdx[a.idx] || {})[a.user_id] = a;

  const [p1, p2] = players;
  const rounds = [];
  const perTheme = {};
  const stat = {};
  players.forEach(p => { stat[p.id] = { times: [], longest: '', yes: 0, answered: 0 }; });

  let prevUnlock = game.created_at;
  let yesTotal = 0, yesMatch = 0, echoes = 0;

  qids.forEach((qid, idx) => {
    const q = QMAP.get(qid);
    const pair = byIdx[idx] || {};
    const a1 = pair[p1.id], a2 = pair[p2.id];
    const cmp = compare(q.type, a1 && a1.answer, a2 && a2.answer);
    const complete = !!(a1 && a2);

    if (complete) {
      if (q.type === 'yesno') { yesTotal++; if (cmp.match) yesMatch++; }
      if (cmp.echo) echoes++;
      const t = perTheme[q.theme] || (perTheme[q.theme] = { theme: q.theme, ...THEMES[q.theme], match: 0, total: 0 });
      t.total++;
      if (cmp.match || cmp.echo) t.match++;
    }

    const answersOut = {};
    for (const p of players) {
      const a = pair[p.id];
      if (!a) continue;
      const time = Math.max(0, a.created_at - prevUnlock);
      const s = stat[p.id];
      s.times.push(time);
      s.answered++;
      if (q.type === 'yesno' && a.answer === 'oui') s.yes++;
      if (q.type === 'open' && a.answer.length > s.longest.length) s.longest = a.answer;
      answersOut[p.id] = { answer: a.answer, image: a.image_url, thumb: a.image_thumb, credit: a.image_credit, time };
    }
    if (complete) prevUnlock = Math.max(a1.created_at, a2.created_at);

    rounds.push({ idx, id: q.id, question: q.q, type: q.type, theme: q.theme, themeLabel: THEMES[q.theme].label, icon: THEMES[q.theme].icon, color: THEMES[q.theme].color, answers: answersOut, complete, ...cmp });
  });

  const completed = rounds.filter(r => r.complete).length;
  const base = yesTotal ? (yesMatch / yesTotal) * 100 : 55;
  const score = completed ? Math.min(100, Math.round(base * 0.85 + echoes * 6 + 5)) : 0;

  const players_stats = players.map(p => {
    const s = stat[p.id];
    const avg = s.times.length ? Math.round(s.times.reduce((x, y) => x + y, 0) / s.times.length / 1000) : 0;
    return { id: p.id, pseudo: p.pseudo, color: p.color, avgSeconds: avg, yes: s.yes, answered: s.answered, longest: s.longest };
  });

  const highlights = [];
  const agreed = rounds.filter(r => r.match === true).map(r => r.question);
  const disagreed = rounds.filter(r => r.match === false).map(r => r.question);
  const echoed = rounds.filter(r => r.echo).map(r => r.question);
  const themesSorted = Object.values(perTheme).sort((a, b) => (b.match / b.total) - (a.match / a.total));
  if (themesSorted[0] && themesSorted[0].match) highlights.push(`Meilleure synergie : ${themesSorted[0].icon} ${themesSorted[0].label}`);
  if (echoed.length) highlights.push(`${echoed.length} réponse(s) libre(s) avec des mots en commun : vous êtes sur la même longueur d’onde.`);
  const fast = [...players_stats].sort((a, b) => a.avgSeconds - b.avgSeconds)[0];
  if (fast && completed > 1) highlights.push(`Pilote le plus rapide : ${fast.pseudo} (${fast.avgSeconds}s en moyenne)`);

  return {
    game: { id: game.id, linkId: game.link_id, size: game.size, status: game.status, created_at: game.created_at, finished_at: game.finished_at, themes: JSON.parse(game.themes) },
    players: players.map(p => ({ id: p.id, pseudo: p.pseudo, color: p.color })),
    score, rank: rankFor(score), completed, yesTotal, yesMatch, echoes,
    perTheme: Object.values(perTheme), rounds, stats: players_stats, agreed, disagreed, highlights,
  };
}

module.exports = { buildReport, compare, QMAP };
