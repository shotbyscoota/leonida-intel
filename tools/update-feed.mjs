#!/usr/bin/env node
// Leonida Intel feed updater. No dependencies, Node 18+.
// Pulls: your YouTube channel, Rockstar's YouTube channel (GTA VI videos only), GTA 6 headlines
// from Google News, plus content/clips.json and content/drops.json. Writes dist/data/feed.js
// (window.LEONIDA_FEED = {...}) so the page works from a server and from a double-clicked file.
// A source that fails keeps its last good items, so one bad fetch never empties the page.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p, d) => { try { return JSON.parse(readFileSync(join(root, p), 'utf8')); } catch { return d; } };
const cfg = read('content/config.json', {});
const OUT = join(root, 'dist/data/feed.js');
const UA = 'LeonidaIntelFeed/1.0 (+fan site updater)';

function previous() {
  if (!existsSync(OUT)) return {};
  const txt = readFileSync(OUT, 'utf8');
  const i = txt.indexOf('{');
  try { return JSON.parse(txt.slice(i, txt.lastIndexOf('}') + 1)); } catch { return {}; }
}
const prev = previous();

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };
const blocks = (xml, name) => xml.match(new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, 'g')) || [];
const ytId = (u = '') => (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(u) ? u : null);

async function channel(ch, from) {
  if (!ch?.channelId) return [];
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`);
  const want = (ch.onlyIfTitleHas || []).map((w) => w.toLowerCase());
  return blocks(xml, 'entry').map((e) => {
    const id = tag(e, 'yt:videoId');
    const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    return {
      id, title: tag(e, 'title'), date: tag(e, 'published'), from,
      short: link.includes('/shorts/'),
      views: +((e.match(/views="(\d+)"/) || [])[1] || 0),
    };
  }).filter((v) => v.id && (!want.length || want.some((w) => v.title.toLowerCase().includes(w))));
}

async function news(n) {
  if (!n?.query) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(n.query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await get(url);
  const skip = (n.skipSources || []).map((s) => s.toLowerCase());
  const seen = new Set();
  return blocks(xml, 'item').map((it) => {
    const source = tag(it, 'source');
    let title = tag(it, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, link: tag(it, 'link'), source, date: new Date(tag(it, 'pubDate')).toISOString() };
  }).filter((x) => {
    const k = x.title.toLowerCase().slice(0, 60);
    if (seen.has(k) || skip.includes(x.source.toLowerCase())) return false;
    seen.add(k); return true;
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n.max || 12);
}

async function safe(name, fn, fallback) {
  try { const v = await fn(); console.log(`ok   ${name}: ${v.length}`); return { v, ok: true }; }
  catch (e) { console.log(`FAIL ${name}: ${e.message} (kept ${fallback?.length || 0} old items)`); return { v: fallback || [], ok: false }; }
}

const [mine, official, headlines] = await Promise.all([
  safe('your channel', () => channel(cfg.yourChannel, 'you'), prev.mine),
  safe('Rockstar channel', () => channel(cfg.officialChannel, 'rockstar'), prev.official),
  safe('news', () => news(cfg.news), prev.news),
]);

// Hand-added clips win over channel copies of the same video; pinned ones go first.
const manual = (read('content/clips.json', {}).clips || []).map((c) => ({
  id: ytId(c.url || c.id), title: c.title || '', date: c.date || '', from: c.from || 'you', pin: !!c.pin, short: /shorts\//.test(c.url || ''),
})).filter((c) => c.id);
const byId = new Map();
for (const c of [...manual, ...mine.v]) if (!byId.has(c.id)) byId.set(c.id, c);
const clips = [...byId.values()].sort((a, b) => (b.pin - a.pin) || (b.date || '').localeCompare(a.date || '')).slice(0, cfg.maxClips || 24);

const drops = (read('content/drops.json', {}).drops || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const feed = {
  updated: new Date().toISOString(),
  channel: { name: cfg.yourChannel?.name, handle: cfg.yourChannel?.handle, url: cfg.yourChannel?.handle ? `https://www.youtube.com/${cfg.yourChannel.handle}` : '' },
  clips, mine: mine.v,
  official: official.v.slice(0, cfg.maxOfficial || 10),
  news: headlines.v, drops,
  health: { mine: mine.ok, official: official.ok, news: headlines.ok },
};

// Only rewrite when something other than the timestamp changed, so the scheduled job makes no empty commits.
const strip = (f) => JSON.stringify({ ...f, updated: 0, health: 0 });
if (prev.updated && strip(prev) === strip(feed)) { console.log('no change'); process.exit(0); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `/* written by tools/update-feed.mjs; do not edit by hand */\nwindow.LEONIDA_FEED = ${JSON.stringify(feed, null, 1)};\n`);
console.log(`wrote ${OUT}: ${clips.length} clips, ${feed.official.length} official, ${feed.news.length} news, ${drops.length} drops`);
