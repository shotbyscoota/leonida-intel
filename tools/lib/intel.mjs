// Leonida Intel research scanner: pure functions, no network, no dependencies.
// Everything a feed or web page says is UNTRUSTED DATA. It is cleaned, length-capped and stored as text;
// nothing from a source is ever executed, followed as an instruction, or rendered as HTML.

export const STATUSES = ['Official', 'Tested', 'Reported', 'Patched', 'Unverified'];
export const CATS = ['official', 'patch', 'cheat', 'glitch', 'secret'];
const RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-', hellip: '...' };
export function decode(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
/** Plain text only: tags stripped, control characters removed, whitespace collapsed, length capped. */
export function clean(s, max = 200) {
  let t = decode(decode(s)).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}
/** Only absolute http(s) URLs survive. */
export function safeUrl(u) {
  try { const x = new URL(decode(String(u || '')).trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}
const TRACK = /^(utm_|fbclid|gclid|mc_|ref$|ref_src|cmpid|oc$|ito$|taid$|guccounter)/i;
/** Canonical form used for de-duplication: https, no www, no tracking params, no hash, no trailing slash. */
export function canonicalUrl(u) {
  const s = safeUrl(u); if (!s) return '';
  const x = new URL(s);
  x.protocol = 'https:'; x.hostname = x.hostname.toLowerCase().replace(/^(www|old|m|amp)\./, ''); x.hash = '';
  if (x.hostname === 'youtu.be' || x.hostname.endsWith('youtube.com')) { const id = videoId(s); return id ? `https://youtube.com/watch?v=${id}` : x.href; }
  for (const k of [...x.searchParams.keys()]) if (TRACK.test(k)) x.searchParams.delete(k);
  if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, '');
  return x.href.replace(/\?$/, '');
}
export const videoId = (u = '') => (String(u).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || null;
/** Google News article id: stable per story, so the same story found by two queries is one item. */
export const gnId = (u = '') => (String(u).match(/news\.google\.com\/(?:rss\/)?articles\/([\w-]+)/) || [])[1] || null;
// Section prefixes some outlets add in their own RSS but not on Google News ("Guide: ...") are ignored.
export const titleKey = (t = '') => clean(t, 400).replace(/^(guide|feature|news|review|video|opinion|poll|preview|interview)\s*:\s*/i, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);

/* ---------- reading feeds (RSS 2.0 and Atom) ---------- */
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? m[1] : ''; };
const blocks = (xml, name) => xml.match(new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, 'g')) || [];
export function parseFeed(xml = '') {
  const out = [];
  for (const it of blocks(xml, 'item')) {
    const src = it.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    out.push({ title: tag(it, 'title'), link: tag(it, 'link') || tag(it, 'guid'), date: tag(it, 'pubDate') || tag(it, 'dc:date'), source: src ? src[2] : '', sourceUrl: src ? src[1] : '' });
  }
  for (const e of blocks(xml, 'entry')) {
    const href = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    out.push({ title: tag(e, 'title'), link: href, date: tag(e, 'published') || tag(e, 'updated'), source: '', sourceUrl: '', vid: tag(e, 'yt:videoId') });
  }
  return out;
}

/* ---------- reading a headline ---------- */
const GTA = /\b(gta\s*(6|vi)|grand theft auto\s*(6|vi))\b|\bleonida\b/i;
export const aboutGta6 = (t) => GTA.test(t);
const RX = {
  patch: /\b(patch(es|ed)?|hotfix|title update|update[sd]?|patch notes|version\s*\d|v?0?1\.\d{3}\.\d{3}|fix(es|ed)\b)/i,
  cheat: /\bcheats?\b|cheat codes?/i,
  glitch: /\bglitch(es|ed)?\b|\bbugs?\b|\bbugged\b|\bexploits?\b|soft-?lock|\bcrash(es|ing)?\b|\bdupe\b|duplication/i,
  secret: /\bsecrets?\b|easter eggs?|\bhidden\b|\bdiscover(ed|y|s)?\b|\btips?\b|\btricks?\b|\bhacks\b|how to|locations?\b|\bguide\b|walkthrough|you (can|didn.t)|\bencounters?\b|\bunlock(s|ed)?\b/i,
};
/** Which research bucket a headline belongs to, or null when it is general news. A patch that fixes bugs is a patch. */
export function classify(title = '') {
  const t = clean(title, 400);
  if (/anti-?cheat|competitor/i.test(t)) return null;
  if (RX.cheat.test(t)) return 'cheat';
  if (RX.patch.test(t) && !/money glitch|glitch unlocks/i.test(t)) return 'patch';
  if (RX.glitch.test(t)) return 'glitch';
  if (RX.secret.test(t)) return 'secret';
  return null;
}
export function platformOf(t = '') {
  const ps = /\bps5\b|playstation\s*5/i.test(t), xb = /\bxbox\b|series\s*[xs]\b/i.test(t);
  return ps && xb ? 'PS5 + Xbox Series X|S' : ps ? 'PS5' : xb ? 'Xbox Series X|S' : '';
}
export function versionOf(t = '') { const m = String(t).match(/\b(0?1\.\d{3}\.\d{3})\b/); return m ? m[1].replace(/^0/, '') : ''; }
export function compareVersions(a = '', b = '') {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
const iso = (d) => { if (!d) return ''; const t = new Date(d); return isNaN(t) ? '' : t.toISOString(); };

export function keyOf({ url = '', title = '' }) {
  const v = videoId(url); if (v) return 'yt:' + v;
  const g = gnId(url); if (g) return 'gn:' + g;
  const c = canonicalUrl(url); if (c) return 'url:' + c;
  return 't:' + titleKey(title);
}

/**
 * Turns raw feed entries from one source into intel items.
 * source: { name, kind: 'official'|'outlet'|'search'|'community', publisher?, officialHosts? }
 * Status comes from WHO said it, never from what the text claims about itself.
 */
export function toItems(entries, source, trusted = []) {
  const trustedSet = new Set(trusted.map((p) => p.toLowerCase()));
  const out = [];
  for (const e of entries) {
    let title = clean(e.title, 220);
    let publisher = clean(e.source || source.publisher || source.name, 60);
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
    const url = safeUrl(e.link);
    if (!title || !url) continue;
    let status, cat = classify(title);
    if (source.kind === 'official') {
      let host = ''; try { host = new URL(safeUrl(e.sourceUrl) || url).hostname; } catch {}
      if (!(source.officialHosts || ['rockstargames.com']).some((h) => host === h || host.endsWith('.' + h))) continue;
      if (!aboutGta6(title)) continue;
      status = 'Official'; cat = cat === 'patch' ? 'patch' : 'official'; publisher = 'Rockstar Games';
    } else {
      if (!(source.assumeTopic || aboutGta6(title)) || !cat) continue;
      if (source.kind === 'community') { status = 'Unverified'; publisher = source.publisher || source.name; }
      else status = trustedSet.has(publisher.toLowerCase()) ? 'Reported' : 'Unverified';
    }
    out.push({
      id: keyOf({ url, title }), cat, status, title, url: gnId(url) ? url : canonicalUrl(url), publisher, via: source.name, kind: source.kind,
      date: iso(e.date), platform: platformOf(title), version: versionOf(title), tkey: titleKey(title),
    });
  }
  return out;
}

/**
 * Adds a scan's items to the ledger without duplicates. Same story = same canonical URL / video id /
 * Google News id, or the same normalised headline. First-seen never moves; last-checked is the latest
 * scan that still saw it. A direct outlet URL replaces a Google News redirect.
 */
export function merge(ledger, found, now) {
  ledger.items ||= {};
  const byTitle = new Map(Object.entries(ledger.items).map(([k, v]) => [v.tkey, k]));
  const added = [];
  for (const it of found) {
    const k = ledger.items[it.id] ? it.id : byTitle.get(it.tkey);
    if (!k) { ledger.items[it.id] = { ...it, firstSeen: now, lastChecked: now }; byTitle.set(it.tkey, it.id); added.push(it.id); continue; }
    const cur = ledger.items[k];
    cur.lastChecked = now;
    if (cur.desk) continue;
    if (gnId(cur.url) && !gnId(it.url)) { cur.url = it.url; cur.via = it.via; }
    if (RANK[it.status] < RANK[cur.status]) { cur.status = it.status; cur.publisher = it.publisher; }
    if (!cur.date && it.date) cur.date = it.date;
    if (!cur.platform && it.platform) cur.platform = it.platform;
    if (!cur.version && it.version) cur.version = it.version;
  }
  return added;
}

/** Drops old automatic items so the ledger cannot grow forever. Desk entries never expire. */
export function prune(ledger, now, days = 45) {
  const cut = new Date(now) - days * 864e5;
  for (const [k, v] of Object.entries(ledger.items || {})) if (!v.desk && new Date(v.firstSeen) < cut) delete ledger.items[k];
}

/**
 * Desk entries (content/intel.json) are written by a person after checking or testing something.
 * A claim may only show as Tested when the record carries the proof fields; otherwise it drops to Reported.
 */
export function deskProblems(e) {
  const p = [];
  if (!STATUSES.includes(e.status)) p.push(`status must be one of ${STATUSES.join(', ')}`);
  if (!e.title) p.push('title missing');
  if (!CATS.includes(e.cat)) p.push(`cat must be one of ${CATS.join(', ')}`);
  if (['Official', 'Reported', 'Patched'].includes(e.status) && !safeUrl(e.url)) p.push('a source url is required');
  if (e.status === 'Tested') {
    if (!e.tested?.on || !e.tested?.version || !e.tested?.platform) p.push('Tested needs tested.on, tested.version and tested.platform');
    if (e.cat === 'cheat' && !(e.cheat?.input && e.cheat?.unlock && typeof e.cheat?.affectsSaves === 'boolean' && typeof e.cheat?.affectsAchievements === 'boolean'))
      p.push('a Tested cheat needs cheat.input, cheat.unlock, cheat.affectsSaves and cheat.affectsAchievements (true/false)');
    if (e.cat === 'glitch' && typeof e.glitch?.reproducesOnLatest !== 'boolean') p.push('a Tested glitch needs glitch.reproducesOnLatest (true/false)');
  }
  return p;
}
export function applyDesk(ledger, entries = [], now, warn = () => {}) {
  ledger.items ||= {};
  for (const raw of entries) {
    const e = { ...raw };
    const problems = deskProblems(e);
    if (problems.length) {
      warn(`desk entry "${e.title || '?'}": ${problems.join('; ')}`);
      if (!STATUSES.includes(e.status) || !CATS.includes(e.cat) || !e.title) continue;
      if (e.status === 'Tested') e.status = 'Reported';
      if (['Official', 'Reported', 'Patched'].includes(e.status) && !safeUrl(e.url)) e.status = 'Unverified';
    }
    if (e.cat === 'glitch' && e.status === 'Tested' && e.glitch?.reproducesOnLatest === false) e.status = 'Patched';
    const url = safeUrl(e.url);
    const id = e.id ? 'desk:' + e.id : keyOf({ url, title: e.title });
    const tk = titleKey(e.title);
    const cu = url ? (gnId(url) ? url : canonicalUrl(url)) : '';
    const match = ledger.items[id] ? id : Object.keys(ledger.items).find((k) => (cu && ledger.items[k].url === cu) || ledger.items[k].tkey === tk);
    const prev = match ? ledger.items[match] : null;
    if (match && match !== id) delete ledger.items[match];
    const item = {
      id, desk: true, cat: e.cat, status: e.status, title: clean(e.title, 220), url: cu,
      publisher: clean(e.publisher || prev?.publisher || 'Leonida Intel desk', 60), via: 'desk', kind: 'desk',
      date: iso(e.date) || prev?.date || '', platform: clean(e.platform || prev?.platform || '', 60), version: clean(e.version || prev?.version || '', 20),
      evidence: clean(e.evidence || '', 500), note: clean(e.note || '', 300), tkey: tk,
      firstSeen: prev?.firstSeen || iso(e.date) || now, lastChecked: iso(e.lastChecked) || prev?.lastChecked || now,
    };
    if (e.cheat) item.cheat = { input: clean(e.cheat.input || '', 160), unlock: clean(e.cheat.unlock || '', 200), affectsSaves: e.cheat.affectsSaves ?? null, affectsAchievements: e.cheat.affectsAchievements ?? null };
    if (e.glitch) item.glitch = { reproducesOnLatest: e.glitch.reproducesOnLatest ?? null };
    if (e.tested) item.tested = { on: clean(e.tested.on || '', 30), version: clean(e.tested.version || '', 20), platform: clean(e.tested.platform || '', 60) };
    ledger.items[id] = item;
  }
}

/** Glitches reported before the latest patch get a plain warning instead of being silently trusted. */
export function annotate(items, latest) {
  for (const it of items) {
    if (it.cat === 'glitch' && latest?.date && !['Tested', 'Patched'].includes(it.status) && !it.note) {
      const when = it.date || it.firstSeen;
      if (when && new Date(when) < new Date(latest.date)) it.note = `Reported before update ${latest.version} (${latest.date.slice(0, 10)}). Not re-tested since.`;
    }
  }
  return items;
}

/** What the page shows: per bucket, checked items first and newest first, then a few unverified leads. */
export function select(ledger, { perCat = 8, leadsPerCat = 3, maxAgeDays = 30, now } = {}) {
  const cut = new Date(now) - maxAgeDays * 864e5;
  const t = (v) => v.date || v.firstSeen || '';
  const out = [];
  for (const cat of CATS) {
    const pool = Object.values(ledger.items || {}).filter((v) => v.cat === cat && (v.desk || new Date(t(v)) >= cut))
      .sort((a, b) => (b.desk ? 1 : 0) - (a.desk ? 1 : 0) || RANK[a.status] - RANK[b.status] || t(b).localeCompare(t(a)));
    out.push(...pool.filter((v) => v.status !== 'Unverified').slice(0, perCat), ...pool.filter((v) => v.status === 'Unverified').slice(0, leadsPerCat));
  }
  return out.map(({ tkey, ...v }) => v);
}
