#!/usr/bin/env node
// One-time: turns Natural Earth (public domain) Florida + Lake Okeechobee into the schematic
// Leonida outline used by the map. The output (content/map/outline.json) is committed, so the
// map never needs this script or the network again. Re-run only to change the stand-in shape.
//
//   node tools/map/make-outline.mjs <ne_10m_admin_1_states_provinces.geojson> <ne_10m_lakes.geojson>
//
// Leonida is Rockstar's fictional version of Florida. The real coastline is a stand-in, drawn as
// neon outlines and labelled as such on the page; it is not Rockstar's map art.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [statesPath, lakesPath] = process.argv.slice(2);
if (!statesPath || !lakesPath) { console.error('usage: make-outline.mjs <states.geojson> <lakes.geojson>'); process.exit(1); }
const WEST = -85.3; // drop the far panhandle: Leonida is the peninsula plus the big bend
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const states = JSON.parse(readFileSync(statesPath, 'utf8'));
const fl = states.features.find((f) => f.properties.name === 'Florida' && f.properties.iso_a2 === 'US');
const polys = fl.geometry.type === 'Polygon' ? [fl.geometry.coordinates] : fl.geometry.coordinates;

// Sutherland-Hodgman clip of a ring against lon >= WEST.
function clip(ring) {
  const out = [], inside = (p) => p[0] >= WEST;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (WEST - a[0]) / (b[0] - a[0]); out.push([WEST, a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}
// Douglas-Peucker, tolerance in degrees.
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let max = 0, idx = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = s + 1; i < e; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > max) { max = d; idx = i; } }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// A closed ring (first point == last) collapses under Douglas-Peucker, because its base line has
// zero length. Simplify it as two open halves instead.
function simplifyRing(ring, tol) {
  let r = ring;
  if (r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  if (r.length < 4) return r;
  const mid = r.length >> 1;
  const a = simplify(r.slice(0, mid + 1), tol), b = simplify(r.slice(mid).concat([r[0]]), tol);
  return a.concat(b.slice(1, -1));
}
const r4 = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];

const land = [];
for (const poly of polys) {
  let ring = poly[0];
  if (ring.every((p) => p[0] < WEST)) continue;
  ring = clip(ring);
  if (ring.length < 3) continue;
  const big = ring.length > 200;
  const s = simplifyRing(ring, big ? 0.006 : 0.002).map(r4);
  if (s.length >= 3) land.push(s);
}
const lakes = JSON.parse(readFileSync(lakesPath, 'utf8'));
const ok = lakes.features.find((f) => /okeechobee/i.test(f.properties.name || ''));
const lake = simplifyRing(ok.geometry.coordinates[0], 0.004).map(r4);

const out = {
  _about: 'Schematic outline for the Leonida Intel map. Stand-in shape: the real Florida coastline (Natural Earth 10m, public domain), far panhandle removed, Lake Okeechobee standing in for Lake Leonida. Not Rockstar map art. Regenerate with tools/map/make-outline.mjs.',
  source: 'Natural Earth 10m admin-1 states/provinces and lakes (public domain), naturalearthdata.com',
  westCrop: WEST,
  land,
  lakes: [{ name: 'Lake Leonida', standIn: 'Lake Okeechobee', ring: lake }],
};
mkdirSync(join(root, 'content/map'), { recursive: true });
writeFileSync(join(root, 'content/map/outline.json'), JSON.stringify(out));
console.log(`land rings ${land.length}, points ${land.reduce((a, r) => a + r.length, 0)}, lake points ${lake.length}`);
