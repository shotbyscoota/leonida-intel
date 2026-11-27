#!/usr/bin/env node
// Strict editorial audit of content/map/places.json. Catches what the build's hard rules let through:
// cut-off text, doubled words, near-duplicate spots, pins far from the region they claim, pins in open sea,
// labels that disagree with their sources, and (with --links) dead source links.
//
//   node tools/audit-map.mjs            text, duplicates, positions, labels
//   node tools/audit-map.mjs --links    also requests every source URL once (slow, needs network)
//
// Exit code 1 when anything at level ERROR is found. WARN lines are for a human to look at.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'content/map/places.json'), 'utf8'));
const world = JSON.parse(readFileSync(join(root, 'content/map/leonida.json'), 'utf8'));
// land outlines (outer rings) in map units; 1 unit = 32 m
const KM = 0.032;
const decode = (a) => { const o = []; let X = 0, Y = 0; for (let i = 0; i < a.length; i += 2) { X += a[i]; Y += a[i + 1]; o.push([X / world.q, Y / world.q]); } return o; };
const landRings = world.land.map((poly) => decode(poly[0]));
const cfg = JSON.parse(readFileSync(join(root, 'content/config.json'), 'utf8'));
const out = [];
const err = (id, m) => out.push(['ERROR', id, m]);
const warn = (id, m) => out.push(['WARN', id, m]);

const TRUSTED = new Set([...(cfg.intel?.trustedPublishers || []), 'GamesRadar+', 'PC Gamer', 'IGN', 'Push Square', 'Sportskeeda', 'Dexerto', 'GameSpot',
  'Eurogamer', 'VGC', 'TheGamer', 'Game Rant', 'GameRant', 'Polygon', 'Rock Paper Shotgun', 'Pure Xbox', 'Forbes']);
const LIMITS = { name: 80, area: 80, summary: 400, reward: 160, needs: 200 };
const ENDS = /[.!?)"'”’…]$/;
const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);

// point in polygon (map units) against the land rings, for "pin in open sea"
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const distToLand = (p) => { let best = Infinity; for (const r of landRings) for (const q of r) best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1]) * KM); return best; };
const WATERY = /\b(sea|ocean|wreck|shipwreck|underwater|open water|offshore|reef|boat|bay|sound|straits?|island|key|keys|marina|lighthouse|jet ?ski|kraken|merman|kayak|squalo|airboat)\b/i;

const regions = Object.fromEntries(data.regions.map((r) => [r.id, r]));
const seenUrl = new Map(), noRegion = [];
// Pairs a human has looked at and confirmed are different spots.
const DIFFERENT = new Set(['port-vice-city / port-vice-city-tunnel', 'skunk-ape / skunk-ape-sighting']);
for (const p of data.places) {
  const id = p.id;
  // text
  for (const [k, n] of Object.entries(LIMITS)) {
    const v = p[k] || '';
    if (v.length >= n) err(id, `${k} is exactly at the ${n}-character cap, so it was probably cut off: "…${v.slice(-30)}"`);
    if (/\s{2,}|\s$|^\s/.test(v)) warn(id, `${k} has stray spaces`);
    if (/\b(\w+) \1\b/i.test(v) && !/\b(very very|bye bye|no no)\b/i.test(v)) warn(id, `${k} repeats a word: "${v.match(/\b(\w+) \1\b/i)[0]}"`);
    if (/<[a-z/]|&[a-z]+;/i.test(v)) err(id, `${k} contains markup or an HTML entity`);
    if (/\uFFFD|Ã.|â€/.test(v)) err(id, `${k} has a broken character (bad text encoding): "${v.match(/.{0,12}(\uFFFD|Ã.|â€).{0,12}/)[0]}"`);
  }
  if (p.summary && !ENDS.test(p.summary.trim())) err(id, `summary does not end with a full stop: "…${p.summary.slice(-40)}"`);
  for (const [i, h] of (p.how || []).entries()) {
    if (/\uFFFD|Ã.|â€/.test(h)) err(id, `how step ${i + 1} has a broken character`);
    if (h.length >= 300) err(id, `how step ${i + 1} is at the 300-character cap (cut off)`);
    if (!ENDS.test(h.trim())) warn(id, `how step ${i + 1} has no closing punctuation: "…${h.slice(-30)}"`);
  }
  if ((p.summary.match(/Where:/g) || []).length > 1) err(id, 'summary has "Where:" twice');
  if (p.name === p.name.toLowerCase()) warn(id, 'name is all lower case');
  // labels vs sources
  const pubs = p.sources.map((s) => s.publisher);
  if (p.status === 'Reported' && !pubs.some((x) => TRUSTED.has(x))) err(id, `Reported, but no source is a named outlet (${pubs.join(', ')})`);
  if (p.status === 'Unverified' && pubs.some((x) => TRUSTED.has(x)) && !p.statusNote) warn(id, `Unverified, but ${pubs.filter((x) => TRUSTED.has(x)).join(', ')} is a named outlet: could be Reported`);
  for (const s of p.sources) {
    if (!/^https:\/\//.test(s.url)) warn(id, `source is not https: ${s.url}`);
    if (!seenUrl.has(s.url)) seenUrl.set(s.url, []);
    seenUrl.get(s.url).push(id);
  }
  const urls = p.sources.map((s) => s.url);
  if (new Set(urls).size !== urls.length) err(id, 'the same source is listed twice');
  // positions
  if (p.pos) {
    const r = regions[p.region];
    const onLand = landRings.some((ring) => inRing(p.pos, ring));
    const d = onLand ? 0 : distToLand(p.pos);
    if (!onLand && d > 0.25 && !WATERY.test(p.name + ' ' + p.area + ' ' + p.summary + ' ' + (p.mapRef?.name || ''))) warn(id, `pin is ${d.toFixed(2)} km out in the water and nothing in the text says water`);
    if (r) {
      const km = Math.hypot(r.anchor[0] - p.pos[0], r.anchor[1] - p.pos[1]) * KM;
      if (km > 9) warn(id, `pin is ${km.toFixed(1)} km from the ${r.name} label: wrong region?`);
    }
    for (const m of p.more || []) if (Math.hypot(m.pos[0] - p.pos[0], m.pos[1] - p.pos[1]) * KM > 12) warn(id, `extra spot "${m.label}" is over 12 km from the pin`);
  } else if (p.precision !== 'region') warn(id, 'no pin but precision is not region');
  if (p.region === null && p.pos) noRegion.push(id);
}
// near-duplicates: same category and most name words shared
const P = data.places;
for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
  const a = new Set(words(P[i].name).filter((w) => w.length > 2)), b = new Set(words(P[j].name).filter((w) => w.length > 2));
  const inter = [...a].filter((w) => b.has(w)).length, uni = new Set([...a, ...b]).size;
  const close = P[i].pos && P[j].pos && Math.hypot(P[i].pos[0] - P[j].pos[0], P[i].pos[1] - P[j].pos[1]) * KM < 0.3;
  if (DIFFERENT.has(`${P[i].id} / ${P[j].id}`)) continue;
  if (uni && inter / uni >= 0.6 && (close || P[i].cat === P[j].cat)) warn(`${P[i].id} / ${P[j].id}`, `look like the same spot ("${P[i].name}" / "${P[j].name}")`);
}
// the same in-game place spelled two ways
const areaWords = new Map();
for (const p of P) for (const m of (p.area + ' ' + p.name).matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)*) (Keys?|Island|Bay)\b/g)) { const k = m[0]; areaWords.set(k, (areaWords.get(k) || 0) + 1); }
const names = [...areaWords.keys()];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = names[i], b = names[j];
  if (a.split(' ').pop() !== b.split(' ').pop()) continue;
  const x = a.toLowerCase(), y = b.toLowerCase();
  let diff = Math.abs(x.length - y.length); if (diff <= 1) { let k = 0; while (k < x.length && x[k] === y[k]) k++; const rest = (s) => s.slice(k + (x.length >= y.length ? 1 : 0)); if (diff === 1 && (x.length > y.length ? x.slice(k + 1) === y.slice(k) : y.slice(k + 1) === x.slice(k))) warn('spelling', `"${a}" and "${b}" both appear; one is probably a typo`); }
}

if (process.argv.includes('--links')) {
  // Sites that refuse automated checkers (403) but load for people. Checked by hand on 2026-11-25.
  const BOT_WALLED = new Set(['games.gg']);
  let walled = 0;
  const list = [...seenUrl.keys()];
  const res = await Promise.all(list.map(async (u, i) => {
    await new Promise((r) => setTimeout(r, i * 60));
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(u, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'leonida-intel-linkcheck/1.0' } });
      clearTimeout(t); return [u, r.status];
    } catch (e) { return [u, 'net:' + (e.name || e.message)]; }
  }));
  for (const [u, s] of res) {
    if (s === 404 || s === 410) err(seenUrl.get(u).join(','), `source link is dead (${s}): ${u}`);
    else if (s === 403 && BOT_WALLED.has(new URL(u).hostname)) walled++;
    else if (s !== 200) warn(seenUrl.get(u).join(','), `source link answered ${s} (often a bot wall, check by hand): ${u}`);
  }
  console.log(`links: ${list.length} checked, ${res.filter(([, s]) => s === 200).length} ok` + (walled ? `, ${walled} on bot-walled sites (open fine by hand)` : ''));
}
for (const [lvl, id, m] of out) console.log(`${lvl.padEnd(5)} ${id}: ${m}`);
if (noRegion.length) console.log(`INFO  ${noRegion.length} pinned spot(s) with "region not confirmed" on purpose: ${noRegion.join(', ')}`);
const e = out.filter((x) => x[0] === 'ERROR').length, w = out.length - e;
console.log(`${P.length} places: ${e} error(s), ${w} warning(s)`);
process.exit(e ? 1 : 0);
