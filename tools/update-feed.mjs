#!/usr/bin/env node
// Leonida Intel scanner + feed writer. No dependencies, Node 18+.
//
//   node tools/update-feed.mjs           scan every source, publish if a change is due (see content/config.json "publish")
//   node tools/update-feed.mjs --force   scan and publish now
//   node tools/update-feed.mjs --check   validate content/*.json only (no network); exit 1 on problems
//
// Reads:  content/config.json, content/clips.json, content/drops.json, content/intel.json, content/patches.json
// Keeps:  data/scan-state.json  (research ledger: first-seen / last-checked per finding, source health, last publish)
// Writes: dist/data/feed.js     (window.LEONIDA_FEED = {...}; the only file the site reads)
//
// Rules: a source that fails never erases what it found before; the same story is never listed twice
// (canonical URL / video id / Google News id / normalised headline); feed text is untrusted data and is
// stored as plain capped text only. Status comes from who published it, never from what the text claims.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as I from './lib/intel.mjs';

const root = process.env.LEONIDA_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = process.env.LEONIDA_NOW || new Date().toISOString();
const args = new Set(process.argv.slice(2));
const read = (p, d) => { try { return JSON.parse(readFileSync(join(root, p), 'utf8')); } catch { return d; } };
const cfg = read('content/config.json', {});
const OUT = join(root, 'dist/data/feed.js');
const STATE = join(root, 'data/scan-state.json');
const UA = 'LeonidaIntelFeed/2.0 (+unofficial GTA VI fan site updater)';
const warnings = [];
const warn = (m) => { warnings.push(m); console.log('WARN ' + m); };

/* ---------- --check: validate hand-edited files, no network ---------- */
const desk = read('content/intel.json', { entries: [] });
for (const e of desk.entries || []) { const p = I.deskProblems(e); if (p.length) warn(`content/intel.json "${e.title || e.id || '?'}": ${p.join('; ')}`); }
for (const r of desk.rejected || []) { const p = I.rejectProblems(r); if (p.length) warn(`content/intel.json rejected "${r?.title || r?.publisher || r?.url || '?'}": ${p.join('; ')}`); }
const rejected = (desk.rejected || []).filter((r) => !I.rejectProblems(r).length);
for (const f of ['content/config.json', 'content/clips.json', 'content/drops.json', 'content/intel.json', 'content/patches.json'])
  if (existsSync(join(root, f)) && read(f, null) === null) warn(`${f} is not valid JSON`);
if (args.has('--check')) { console.log(warnings.length ? `${warnings.length} problem(s)` : 'content OK'); process.exit(warnings.length ? 1 : 0); }

/* ---------- fetching (with test hooks) ---------- */
const FIX = process.env.LEONIDA_FIXTURES, FAIL = process.env.LEONIDA_FAIL ? new RegExp(process.env.LEONIDA_FAIL) : null;
const fixMap = FIX ? JSON.parse(readFileSync(join(FIX, 'map.json'), 'utf8')) : null;
async function get(url) {
  if (FAIL && FAIL.test(url)) throw new Error('simulated failure');
  if (fixMap) { const k = Object.keys(fixMap).find((s) => url.includes(s)); if (!k) throw new Error('no fixture for ' + url); return readFileSync(join(FIX, fixMap[k]), 'utf8'); }
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

/* ---------- state ---------- */
function prevFeed() {
  if (!existsSync(OUT)) return {};
  const t = readFileSync(OUT, 'utf8');
  try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return {}; }
}
const prev = prevFeed();
const state = (() => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } })();
state.items ||= {}; state.sources ||= {};
// First run after the upgrade: seed the ledger from what the site already shows, so first-seen times survive.
for (const it of prev.intel || []) if (!state.items[it.id]) state.items[it.id] = { ...it, tkey: I.titleKey(it.title) };

const health = (name, ok, extra = {}) => {
  const s = state.sources[name] ||= {};
  s.lastRun = NOW; s.ok = ok; Object.assign(s, extra);
  if (ok) { s.lastOk = NOW; delete s.lastError; }
};
async function safe(name, fn) {
  try { const v = await fn(); health(name, true, { count: v.length }); console.log(`ok   ${name}: ${v.length}`); return { v, ok: true }; }
  catch (e) { health(name, false, { lastError: String(e.message).slice(0, 120) }); console.log(`FAIL ${name}: ${e.message} (keeping earlier findings)`); return { v: null, ok: false }; }
}

/* ---------- YouTube channels ---------- */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleFilter = (terms = []) => terms.length ? new RegExp(`(^|[^a-z0-9])(${terms.map(esc).join('|')})(?![a-z0-9])`, 'i') : null;
function keepFor(ch) { const rx = titleFilter(ch?.onlyIfTitleHas); return (v) => !rx || rx.test(v.title || ''); }
async function channel(ch, from) {
  if (!ch?.channelId) return [];
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`);
  return I.parseFeed(xml).map((e) => ({
    id: e.vid || I.videoId(e.link), title: I.clean(e.title, 160), date: e.date, from, short: /\/shorts\//.test(e.link),
  })).filter((v) => v.id).filter(keepFor(ch));
}

/* ---------- The Wire (general headlines) ---------- */
async function news(n) {
  if (!n?.query) return [];
  const skip = (n.skipSources || []).map((s) => s.toLowerCase());
  const skipTitle = titleFilter(n.skipIfTitleHas);   // shopping posts ("Black Friday deals") are not news
  const seen = new Set();
  return I.parseFeed(await get(gnews(n.query))).map((it) => {
    const source = I.clean(it.source, 60); let title = I.clean(it.title, 200);
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const d = new Date(it.date);
    return { title, link: I.safeUrl(it.link), source, date: isNaN(d) ? NOW : d.toISOString() };
  }).filter((x) => {
    const k = I.titleKey(x.title).slice(0, 60);
    if (!x.link || seen.has(k) || skip.includes(x.source.toLowerCase()) || skipTitle?.test(x.title)) return false;
    seen.add(k); return true;
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n.max || 12);
}

/* ---------- research sources ---------- */
const ic = cfg.intel || {};
const ON = (ic.sources || []).filter((s) => s.enabled !== false);
async function scanSource(src) {
  const url = src.type === 'gnews' ? gnews(src.q) : src.url;
  const xml = await get(url);
  if (!/<(rss|feed|rdf:RDF)[\s>]/.test(xml.slice(0, 3000))) throw new Error('response is not a feed (login wall or error page?)');
  return I.toItems(I.parseFeed(xml), src, ic.trustedPublishers || []);
}

/* ---------- run ---------- */
const [mineR, offR, newsR, ...srcR] = await Promise.all([
  safe('YouTube: ' + (cfg.yourChannel?.name || 'your channel'), () => channel(cfg.yourChannel, 'you')),
  safe('YouTube: Rockstar Games', () => channel(cfg.officialChannel, 'rockstar')),
  safe('Google News: The Wire', () => news(cfg.news)),
  ...ON.map((s) => safe(s.name, () => scanSource(s))),
]);
// Last good data: a failed fetch falls back to the previous feed, re-filtered with today's rules.
const mine = mineR.ok ? mineR.v : (prev.mine || []).filter(keepFor(cfg.yourChannel));
const official = offR.ok ? offR.v : (prev.official || []);
const headlines = newsR.ok ? newsR.v : (prev.news || []);

const found = srcR.filter((r) => r.ok).flatMap((r) => r.v).filter((it) => !I.isRejected(it, rejected));
const added = I.merge(state, found, NOW);
I.reclassify(state);
I.dropRejected(state, rejected);
I.applyDesk(state, desk.entries || [], NOW, warn);
I.prune(state, NOW, ic.forgetAfterDays || 45);
console.log(`intel: ${found.length} seen this scan, ${added.length} new, ${Object.keys(state.items).length} in ledger`);

const manual = (read('content/clips.json', {}).clips || []).map((c) => ({
  id: I.videoId(c.url || c.id) || (/^[\w-]{11}$/.test(c.id || '') ? c.id : null), title: I.clean(c.title || '', 160), date: c.date || '', from: c.from || 'you', pin: !!c.pin, short: /shorts\//.test(c.url || ''),
})).filter((c) => c.id);
const byId = new Map();
for (const c of [...manual, ...mine]) if (!byId.has(c.id)) byId.set(c.id, c);
const clips = [...byId.values()].sort((a, b) => (b.pin - a.pin) || (b.date || '').localeCompare(a.date || '')).slice(0, cfg.maxClips || 24);
const drops = (read('content/drops.json', {}).drops || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const patches = (read('content/patches.json', {}).patches || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const versioned = [
  ...patches.filter((p) => p.version).map((p) => ({ version: p.version, date: p.date, status: p.status, url: p.url, source: p.source })),
  ...Object.values(state.items).filter((v) => v.cat === 'patch' && v.status === 'Official' && v.version).map((v) => ({ version: v.version, date: v.date || v.firstSeen, status: 'Official', url: v.url, source: 'Rockstar Games' })),
].sort((a, b) => I.compareVersions(b.version, a.version) || (b.date || '').localeCompare(a.date || ''));
const latestPatch = versioned[0] || null;

const intel = I.annotate(I.select(state, { perCat: ic.perCategory || 8, leadsPerCat: ic.leadsPerCategory ?? 3, maxAgeDays: ic.maxAgeDays || 30, now: NOW }), latestPatch);
const sources = [
  ...ON.map((s) => ({ name: s.name, kind: s.kind })),
  { name: 'YouTube: ' + (cfg.yourChannel?.name || 'your channel'), kind: 'video' }, { name: 'YouTube: Rockstar Games', kind: 'video' }, { name: 'Google News: The Wire', kind: 'search' },
].map((s) => ({ ...s, ok: !!state.sources[s.name]?.ok, lastOk: state.sources[s.name]?.lastOk || null }));

const body = {
  channel: { name: cfg.yourChannel?.name, handle: cfg.yourChannel?.handle, url: cfg.yourChannel?.handle ? `https://www.youtube.com/${cfg.yourChannel.handle}` : '' },
  clips, mine, official: official.slice(0, cfg.maxOfficial || 10), news: headlines, drops,
  intel, patches, latestPatch, sources,
};

/* ---------- publish only when due (each Netlify production deploy can cost credits) ---------- */
const volatile = (k, v) => (k === 'lastChecked' || k === 'lastOk' || k === 'ok' ? undefined : v);
const hash = createHash('sha256').update(JSON.stringify(body, volatile)).digest('hex').slice(0, 16);
const officialIds = intel.filter((v) => v.status === 'Official').map((v) => v.id).concat(official.map((v) => 'yt:' + v.id)).sort();
const pub = cfg.publish || {};
const sinceMin = state.lastPublish ? (new Date(NOW) - new Date(state.lastPublish)) / 6e4 : Infinity;
const newOfficial = officialIds.some((id) => !(state.officialIds || []).includes(id));
const changed = hash !== state.publishedHash;
let why = '';
if (args.has('--force')) why = 'forced';
else if (!state.lastPublish || !existsSync(OUT)) why = 'first publish';
else if (changed && pub.officialNow !== false && newOfficial) why = 'new official item';
else if (changed && sinceMin >= (pub.everyMinutes ?? 180)) why = 'new findings';
else if (sinceMin >= (pub.heartbeatHours ?? 12) * 60) why = 'heartbeat';

if (why) {
  const feed = { updated: NOW, checked: NOW, ...body, health: { mine: mineR.ok, official: offR.ok, news: newsR.ok } };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `/* written by tools/update-feed.mjs; do not edit by hand */\nwindow.LEONIDA_FEED = ${JSON.stringify(feed, null, 1)};\n`);
  Object.assign(state, { lastPublish: NOW, publishedHash: hash, officialIds, pending: false });
  console.log(`PUBLISHED (${why}): ${clips.length} SX clips, ${body.official.length} official videos, ${headlines.length} headlines, ${intel.length} findings, latest patch ${latestPatch?.version || 'n/a'}`);
} else {
  state.pending = changed;
  console.log(changed ? `held: new findings wait for the next publish window (${Math.round(sinceMin)} of ${pub.everyMinutes ?? 180} min)` : 'no change to publish');
}
state.lastScan = NOW;
mkdirSync(dirname(STATE), { recursive: true });
writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
