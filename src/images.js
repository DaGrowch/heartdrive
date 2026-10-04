// Recherche automatique d'une image pour illustrer une réponse.
// 1) Openverse (images libres, sans clé API)  2) Wikimedia Commons  3) rien -> carte illustrée par le thème
const UA = 'HEARTDRIVE/1.0 (jeu de questions entre amis)';

const STOP = new Set(`a à au aux avec ce ces cet cette c ça dans de des du d elle elles en et est été être eu il ils je j la le les leur leurs l lui ma mais me mes moi mon même ne n ni nos notre nous on ou où par pas pour qu que qui sa se ses si son sur ta te tes toi ton tu un une vos votre vous y oui non très trop plus moins bien tout tous toute toutes alors aussi car donc quand comme fait faire avoir suis es sommes êtes sont ai as avons avez ont était étais j'ai jai c'est cest m'a ma t'as quoi ça cela celui celle ceux sans sous chez entre vers après avant encore déjà jamais toujours rien chose truc trucs genre vraiment carrément plutôt peu beaucoup the of and or to in on is it my`.split(/\s+/));

function keywords(text, max = 4) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .slice(0, max)
    .join(' ');
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function openverse(q) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&mature=false`;
  const data = await getJSON(url);
  const r = (data.results || []).filter(x => x.url);
  if (!r.length) return null;
  const pick = r[Math.floor(Math.random() * Math.min(4, r.length))];
  return {
    url: pick.url,
    thumb: pick.thumbnail || pick.url,
    credit: [pick.title, pick.creator && `par ${pick.creator}`, pick.license && `(${String(pick.license).toUpperCase()})`, 'via Openverse'].filter(Boolean).join(' '),
  };
}

async function wikimedia(q) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
  const data = await getJSON(url);
  const pages = Object.values((data.query && data.query.pages) || {}).filter(p => p.imageinfo && p.imageinfo[0]);
  if (!pages.length) return null;
  const p = pages[Math.floor(Math.random() * Math.min(3, pages.length))];
  const info = p.imageinfo[0];
  return { url: info.thumburl || info.url, thumb: info.thumburl || info.url, credit: `${p.title.replace(/^File:/, '')} via Wikimedia Commons` };
}

async function tryAll(q) {
  if (!q) return null;
  for (const provider of [openverse, wikimedia]) {
    try {
      const r = await provider(q);
      if (r) return r;
    } catch (e) { /* on passe au fournisseur suivant */ }
  }
  return null;
}

/**
 * @param {string} answer  réponse saisie
 * @param {{type:string, kw:string}} question
 */
async function findImage(answer, question) {
  const queries = [];
  if (question.type === 'open') {
    const k = keywords(answer);
    if (k) queries.push(k);
    const k2 = keywords(answer, 2);
    if (k2 && k2 !== k) queries.push(k2);
  }
  // oui / non (ou secours) : on illustre le sujet de la question
  queries.push(question.kw);
  for (const q of [...new Set(queries)]) {
    const r = await tryAll(q);
    if (r) return r;
  }
  return null;
}

module.exports = { findImage, keywords };
