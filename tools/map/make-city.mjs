#!/usr/bin/env node
// Occasional: pulls real street, coastline and building data from OpenStreetMap
// (© OpenStreetMap contributors, ODbL) through the public Overpass API, and writes the compact
// city layer content/map/city.json. Vice City is Rockstar's take on Miami, so real Miami streets
// and towers stand in for the city detail, the same way the Florida coast stands in for
// Leonida. The page labels it as real-world data, never as Rockstar's map.
//
//   node tools/map/make-city.mjs <cache-dir>        downloads once into <cache-dir>, then reuses it
//
// The output is committed, so the site never calls OpenStreetMap at run time.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = process.argv[2];
if (!cache) { console.error('usage: make-city.mjs <cache-dir>'); process.exit(1); }
mkdirSync(cache, { recursive: true });
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = '24.40,-85.35,31.05,-79.90';
const METRO = '25.40,-80.55,26.35,-80.03';
// Downtown/Brickell/Edgewater, Miami Beach, Sunny Isles, Fort Lauderdale beach: every building.
const CORES = ['25.745,-80.215,25.815,-80.175', '25.760,-80.150,25.875,-80.118', '25.920,-80.135,25.965,-80.115', '26.100,-80.150,26.135,-80.100'];
// Added later as its own download: the bay islands (Rialto/Venetian, Starfish, Waxman, Dalton) and Little Cuba to Peacock Bay.
const CORES2 = ['25.755,-80.180,25.800,-80.130', '25.715,-80.260,25.775,-80.200'];

const CORE_BOXES = [...CORES, ...CORES2].map((b) => b.split(',').map(Number));
const Q = {
  hw: `way["highway"~"^(motorway|trunk)$"](${STATE});`,
  pri: `way["highway"="primary"](${STATE});`,
  art: `way["highway"~"^(secondary|tertiary)$"](${METRO});`,
  st: CORES.map((b) => `way["highway"="residential"](${b});`).join(''),
  coast: `way["natural"="coastline"](${METRO});`,
  park: `way["leisure"~"^(park|golf_course)$"](${METRO});way["natural"="water"](${METRO});`,
  air: `way["aeroway"="runway"](${STATE});`,
  bld2: CORES2.map((b) => `way["building"](${b});`).join(''),
  bld: CORES.map((b) => `way["building"](${b});`).join('') + `way["building"]["building:levels"](${METRO});way["building"]["height"](${METRO});`,
};
async function get(name) {
  const f = join(cache, name + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const body = 'data=' + encodeURIComponent(`[out:json][timeout:300];(${Q[name]});out geom;`);
  for (let k = 0; k < 4; k++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'leonida-intel-map-build/1.0' } });
    if (r.ok) { const t = await r.text(); writeFileSync(f, t); console.log(`fetched ${name}: ${(t.length / 1e6).toFixed(1)} MB`); return JSON.parse(t); }
    console.log(`${name}: HTTP ${r.status}, retrying`); await new Promise((s) => setTimeout(s, 20000 * (k + 1)));
  }
  throw new Error('overpass failed for ' + name);
}

// Douglas-Peucker on [lon,lat], tolerance in metres.
const KX = 111320 * Math.cos(27.6 * Math.PI / 180), KY = 110570;
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let max = 0, idx = -1;
    const x1 = pts[s][0] * KX, y1 = pts[s][1] * KY, x2 = pts[e][0] * KX, y2 = pts[e][1] * KY, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    for (let i = s + 1; i < e; i++) {
      const x = pts[i][0] * KX, y = pts[i][1] * KY;
      const d = len < 1e-6 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Lines are delta-encoded integers of 1e-5 degrees (about 1 m): [lon0, lat0, dlon, dlat, ...].
const enc = (pts) => { const o = []; let px = 0, py = 0; for (const [x, y] of pts) { const X = Math.round(x * 1e5), Y = Math.round(y * 1e5); o.push(X - px, Y - py); px = X; py = Y; } return o; };
const geom = (w) => (w.geometry || []).filter(Boolean).map((g) => [g.lon, g.lat]);
const len = (g) => { let s = 0; for (let i = 1; i < g.length; i++) s += Math.hypot((g[i][0] - g[i - 1][0]) * KX, (g[i][1] - g[i - 1][1]) * KY); return s; };
const area = (g) => { let s = 0; for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length]; s += a[0] * KX * b[1] * KY - b[0] * KX * a[1] * KY; } return Math.abs(s / 2); };
// Join ways that share end points into longer lines (fewer, smoother strokes).
function chain(ls) {
  const key = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const byEnd = new Map();
  ls.forEach((l, i) => { for (const k of [key(l[0]), key(l[l.length - 1])]) { if (!byEnd.has(k)) byEnd.set(k, []); byEnd.get(k).push(i); } });
  const used = new Uint8Array(ls.length), out = [];
  for (let i = 0; i < ls.length; i++) {
    if (used[i]) continue; used[i] = 1; let cur = ls[i].slice();
    for (let grew = true; grew;) {
      grew = false;
      for (const end of [1, 0]) {
        const k = key(end ? cur[cur.length - 1] : cur[0]);
        const j = (byEnd.get(k) || []).find((n) => !used[n]); if (j == null) continue;
        used[j] = 1; let l = ls[j];
        if (end) { if (key(l[0]) !== k) l = l.slice().reverse(); cur = cur.concat(l.slice(1)); }
        else { if (key(l[l.length - 1]) !== k) l = l.slice().reverse(); cur = l.slice(0, -1).concat(cur); }
        grew = true;
      }
    }
    out.push(cur);
  }
  return out;
}
const lines = (data, tol, min = 0) => chain(data.elements.filter((e) => e.type === 'way').map(geom).filter((g) => g.length > 1))
  .map((g) => simplify(g, tol)).filter((g) => g.length > 1 && len(g) >= min).map(enc);

const out = { source: '© OpenStreetMap contributors (ODbL), via Overpass API', fetched: new Date().toISOString().slice(0, 10), units: '1e-5 degrees, delta-encoded' };
const d = {};
for (const n of Object.keys(Q)) d[n] = await get(n);
out.hw = lines(d.hw, 25);
out.pri = lines(d.pri, 35, 300);
out.art = lines(d.art, 8, 120);
out.st = lines(d.st, 3);
out.coast = lines(d.coast, 6);
out.air = lines(d.air, 10);
out.park = d.park.elements.filter((e) => e.type === 'way' && e.geometry).map((w) => ({ t: w.tags?.natural === 'water' ? 'w' : 'p', g: simplify(geom(w), 8) }))
  .filter((p) => p.g.length > 3 && area(p.g) > (p.t === 'w' ? 60000 : 40000)).map((p) => [p.t, enc(p.g.slice(0, -1))]);
// Buildings: height in metres from height, else levels x 3.3, else 7 m. Tiny sheds are dropped.
const seen = new Set();
out.bld = [];
for (const w of [...d.bld.elements, ...d.bld2.elements]) {
  if (w.type !== 'way' || !w.geometry || seen.has(w.id)) continue; seen.add(w.id);
  const t = w.tags || {}, g = simplify(geom(w), 1.2);
  if (g.length < 4 || area(g) < 60) continue;
  let hgt = parseFloat(t.height); if (!(hgt > 0)) hgt = (parseFloat(t['building:levels']) || 0) * 3.3; if (!(hgt > 0)) hgt = 7;
  // Outside the dense cores only towers and mid-rises are kept, so the whole skyline fits in a few MB.
  const [cx, cy] = g.reduce((a, q) => [a[0] + q[0] / g.length, a[1] + q[1] / g.length], [0, 0]);
  const inCore = CORE_BOXES.some(([s, w, n, e]) => cy >= s && cy <= n && cx >= w && cx <= e);
  if (!inCore && hgt < 15) continue;
  if (inCore && hgt < 15 && area(g) < 150) continue;
  out.bld.push([Math.round(Math.min(hgt, 400)), enc(g.slice(0, -1))]);
}
out.bld.sort((a, b) => a[0] - b[0]);
writeFileSync(join(root, 'content/map/city.json'), JSON.stringify(out));
const c = (k) => out[k].length;
console.log(`wrote content/map/city.json ${(JSON.stringify(out).length / 1e6).toFixed(2)} MB: hw ${c('hw')} pri ${c('pri')} art ${c('art')} st ${c('st')} coast ${c('coast')} park ${c('park')} air ${c('air')} bld ${c('bld')} (60 m+ ${out.bld.filter((b) => b[0] >= 60).length})`);
