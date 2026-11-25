/* Leonida Intel · The map.
   A neon 3D outline map drawn on a plain 2D canvas: no libraries, no CDN, no WebGL, so it keeps
   working for years in any browser. Data: window.LEONIDA_MAP (data/map.js, built from content/map/
   by tools/build-map.mjs) and, optionally, window.LEONIDA_FEED (data/feed.js) for the latest patch
   and fresh leads. Every string from the data is set with textContent, never parsed as HTML.
   Renders only when something changes (no idle animation loop), so it is light on phones. */
(() => {
'use strict';
const MAP = window.LEONIDA_MAP;
const FEED = window.LEONIDA_FEED || {};
const $ = (s, r = document) => r.querySelector(s);
const el = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'style') n.style.cssText = v; else n.setAttribute(k, v); } n.append(...kids.filter((x) => x != null && x !== false)); return n; };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const safe = (u) => /^https?:\/\//.test(u || '') ? u : null;
if (!MAP || !MAP.places) { el('count').textContent = 'Map data did not load.'; return; }

const CATS = {
  weapon: { label: 'Weapons', color: '#ff2e7e' },
  vehicle: { label: 'Vehicles', color: '#19e3d0' },
  secret: { label: 'Secrets', color: '#ffd23f' },
  money: { label: 'Money', color: '#4dff88' },
  mission: { label: 'Missions', color: '#ff8a1f' },
  landmark: { label: 'Landmarks', color: '#fff3e4' },
  service: { label: 'Shops', color: '#7ab8ff' },
};
const REG = Object.fromEntries(MAP.regions.map((r) => [r.id, r]));
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const D = (v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v + 'T12:00:00' : v);

/* ---------- world coordinates: km on a flat plane around the middle of the state ---------- */
const LON0 = -82.4, LAT0 = 27.6, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;
const W = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const land = MAP.outline.land.map((r) => r.map(W));
const borders = land.map((_, i) => new Set((MAP.outline.border || {})[i] || []));
const lakes = (MAP.outline.lakes || []).map((l) => ({ name: l.name, ring: l.ring.map(W) }));
let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
for (const r of land) for (const [x, y] of r) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
const places = MAP.places.map((p) => ({ ...p, w: p.pos ? W(p.pos) : null }));
const placed = places.filter((p) => p.w);

/* ---------- city layer: real streets, coast and buildings (OpenStreetMap, ODbL), loaded after first paint ---------- */
// data/city.js is about 2 MB, so the map draws first and the city fades in when it arrives.
let CITY = null;
const METRO = (() => { const a = W([-80.55, 25.40]), b = W([-80.03, 26.35]); return { x0: a[0], y0: a[1], x1: b[0], y1: b[1] }; })();
function decodeLine(a) {
  const n = a.length >> 1, o = new Float32Array(n * 2); let X = 0, Y = 0;
  for (let i = 0; i < n; i++) { X += a[2 * i]; Y += a[2 * i + 1]; const [x, y] = W([X / 1e5, Y / 1e5]); o[2 * i] = x; o[2 * i + 1] = y; }
  return o;
}
function decodeCity(c) {
  const L = (k) => (c[k] || []).map(decodeLine);
  const bld = (c.bld || []).map(([hm, a]) => {
    let pts = decodeLine(a); const n = pts.length >> 1;
    let ar = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; ar += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; cx += pts[2 * i]; cy += pts[2 * i + 1]; }
    if (ar < 0) { const r = new Float32Array(pts.length); for (let i = 0; i < n; i++) { r[2 * i] = pts[2 * (n - 1 - i)]; r[2 * i + 1] = pts[2 * (n - 1 - i) + 1]; } pts = r; }
    return { h: hm / 1000, pts, n, cx: cx / n, cy: cy / n, tall: hm };
  });
  return { hw: L('hw'), pri: L('pri'), art: L('art'), st: L('st'), coast: L('coast'), air: L('air'),
    park: (c.park || []).map(([t, a]) => ({ t, pts: decodeLine(a) })), bld, source: c.source };
}
function loadCity() {
  const s = document.createElement('script');
  s.src = 'data/city.js'; s.async = true;
  s.onload = () => { if (window.LEONIDA_CITY) { CITY = decodeCity(window.LEONIDA_CITY); window.LEONIDA_CITY = null; draw(); } };
  document.body.append(s);
}

/* ---------- camera ---------- */
const canvas = el('map'), ctx = canvas.getContext('2d');
let cw = 0, ch = 0, dpr = 1;
const cam = { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2 - 20, dist: 900, yaw: -0.18, pitch: 0.92 };
const PITCH3D = 0.92, MIN_D = 1.2, MAX_D = 1600;
// The free part of the canvas: not covered by the filter panel or the open card. The camera
// centres and fits inside it, so a selected pin is never hidden behind a panel.
let free = { l: 0, r: 0, t: 0, b: 0 };
function measureFree() {
  const c = canvas.getBoundingClientRect(), wide = cw > 860;
  free = { l: 0, r: cw, t: 0, b: ch };
  const hr = el('hud').getBoundingClientRect();
  if (wide) free.l = Math.min(cw * 0.45, hr.right - c.left + 12); else free.t = Math.min(ch * 0.5, hr.bottom - c.top + 8);
  if (!el('card').hidden) { const k = el('card').getBoundingClientRect(); if (wide) free.r = Math.max(free.l + 200, k.left - c.left - 12); else free.b = Math.max(free.t + 140, k.top - c.top - 8); }
  if (!wide) free.r = cw - 58;
}
// Flat view: centred. Tilted: the ground plane sits a little lower, like a horizon.
const CX = () => (free.l + free.r) / 2, CY = () => free.t + (free.b - free.t) * (0.5 + 0.06 * Math.min(1, cam.pitch / 0.92));
const focal = () => Math.min(free.r - free.l, (free.b - free.t) * 1.25) * 1.05;
function proj(x, y, z = 0) {
  const dx = x - cam.x, dy = y - cam.y, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const xr = dx * c - dy * s, yr = dx * s + dy * c;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const y2 = yr * cp + z * sp, z2 = -yr * sp + z * cp, depth = cam.dist - z2;
  if (depth < cam.dist * 0.08) return null;
  const f = focal() / depth;
  return [CX() + xr * f, CY() - y2 * f, depth];
}
/** Screen point → ground (z = 0) point, for panning and zooming under the cursor. */
function unproj(sx, sy) {
  const f = focal(), a = (sx - CX()) / f, b = -(sy - CY()) / f;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), den = cp - b * sp;
  if (den <= 0.02) return null;
  const yr = b * cam.dist / den, depth = cam.dist + yr * sp, xr = a * depth;
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  return [cam.x + xr * c + yr * s, cam.y - xr * s + yr * c];
}
function fitAll(list = placed, animate = true, pitch = cam.pitch) {
  // Exact fit: try camera distances and keep the closest one where every pin (base and beam top)
  // and, for the full view, the whole coastline land inside the free area with a margin.
  const pts = list.length ? list.map((p) => p.w) : [];
  if (!list.length || list.length === placed.length) { for (const r of land) for (let i = 0; i < r.length; i += 4) pts.push(r[i]); for (const r of MAP.regions) pts.push(W(r.anchor)); }
  if (!pts.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const save = { ...cam }, m = 28;
  Object.assign(cam, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, pitch });
  const fits = (d) => {
    cam.dist = d;
    const beam = d * 0.075;
    for (const [x, y] of pts) for (const z of [0, beam]) {
      const q = proj(x, y, z);
      if (!q || q[0] < free.l + m || q[0] > free.r - m || q[1] < free.t + m || q[1] > free.b - m - (el('hint').hidden ? 0 : 34)) return false;
    }
    return true;
  };
  let lo = 60, hi = MAX_D;
  if (!fits(hi)) lo = hi; else for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; fits(mid) ? (hi = mid) : (lo = mid); }
  const to = { x: cam.x, y: cam.y, dist: Math.max(lo, hi), pitch };
  Object.assign(cam, save);
  fly(to, animate);
}

/* ---------- animation (only while something moves) ---------- */
let anim = null, dirty = true, raf = 0;
function fly(to, animate = true) {
  if (!animate || RM) { Object.assign(cam, to); anim = null; draw(); return; }
  anim = { from: { ...cam }, to: { ...cam, ...to }, t0: performance.now(), dur: 650 };
  loop();
}
function loop() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(t) {
  raf = 0;
  if (anim) {
    const k = Math.min(1, (t - anim.t0) / anim.dur), e = 1 - Math.pow(1 - k, 3);
    for (const key of ['x', 'y', 'dist', 'yaw', 'pitch']) cam[key] = anim.from[key] + (anim.to[key] - anim.from[key]) * e;
    if (k >= 1) anim = null;
    dirty = true;
  }
  if (dirty) { dirty = false; render(t); }
  if (anim || (selected && !RM)) loop();
}
function draw() { dirty = true; loop(); }

/* ---------- filters ---------- */
const state = { cats: new Set(Object.keys(CATS)), region: '', q: '' };
const visible = (p) => state.cats.has(p.cat) && (!state.region || p.region === state.region) &&
  (!state.q || (p.name + ' ' + p.area + ' ' + p.summary + ' ' + (p.reward || '') + ' ' + (REG[p.region]?.name || '')).toLowerCase().includes(state.q));

/* ---------- render ---------- */
let selected = null, hover = null, hitList = [];
// Rings are drawn segment by segment, including the closing segment back to the first point.
// A segment with an end behind the camera is skipped on its own: there is never a closePath()
// across a gap, which would draw a false straight line across the map.
// pick: 'coast' (shore only), 'border' (land borders only) or 'all'.
function path(ring, z = 0, pick = 'all', borders = null) {
  const n = ring.length, pts = ring.map(([x, y]) => proj(x, y, z));
  let any = false, pen = -1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const isB = !!borders && borders.has(i);
    if ((pick === 'coast' && isB) || (pick === 'border' && !isB)) { pen = -1; continue; }
    const a = pts[i], b = pts[(i + 1) % n];
    if (!a || !b) { pen = -1; continue; }
    if (pen !== i) ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]); pen = i + 1; any = true;
  }
  return any;
}
/** Closed fill, only when the whole ring is in front of the camera (a clipped fill would smear). */
function fillRing(ring) {
  const pts = ring.map(([x, y]) => proj(x, y));
  if (pts.some((p) => !p)) return false;
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  return true;
}
function glow(color, widths) {
  for (const [w, a] of widths) { ctx.globalAlpha = a; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function line(pts, z = 0, close = false) {
  const n = pts.length >> 1; let pen = false, any = false;
  for (let i = 0; i < n + (close ? 1 : 0); i++) {
    const k = i % n, q = proj(pts[2 * k], pts[2 * k + 1], z);
    if (!q) { pen = false; continue; }
    if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
    any = true;
  }
  return any;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Rough on-screen test for a line, from its ends and middle; keeps far-off roads out of the work.
function nearView(pts) {
  const n = pts.length >> 1;
  for (const k of [0, n >> 1, n - 1]) { const q = proj(pts[2 * k], pts[2 * k + 1]); if (q && q[0] > -cw && q[0] < 2 * cw && q[1] > -ch && q[1] < 2 * ch) return true; }
  return false;
}
const metroNear = () => !!CITY && cam.x > METRO.x0 - 60 && cam.x < METRO.x1 + 60 && cam.y > METRO.y0 - 60 && cam.y < METRO.y1 + 60;
function drawCity() {
  if (!CITY) return;
  const d = cam.dist, near = metroNear(), detail = near ? clamp01((260 - d) / 120) : 0;
  ctx.globalCompositeOperation = 'source-over';
  if (detail > 0 && d < 140) {
    for (const p of CITY.park) {
      if (!nearView(p.pts)) continue;
      ctx.beginPath(); if (!line(p.pts, 0, true)) continue;
      ctx.fillStyle = p.t === 'w' ? `rgba(30,110,220,${0.22 * detail})` : `rgba(77,255,136,${0.07 * detail})`; ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  const stroke = (list, color, w, a, test = true) => {
    if (a <= 0.01) return; ctx.beginPath(); let any = false;
    for (const pts of list) { if (test && !nearView(pts)) continue; if (line(pts)) any = true; }
    if (any) { ctx.globalAlpha = a; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); ctx.globalAlpha = 1; }
  };
  const zk = Math.min(3, Math.max(0.6, 60 / d));
  if (detail > 0) {
    ctx.beginPath(); let any = false; for (const pts of CITY.coast) if (line(pts)) any = true;
    if (any) glow('#ff2e7e', [[8, 0.06 * detail], [3.5, 0.16 * detail], [1.4, 0.9 * detail]]);
  }
  stroke(CITY.pri, '#fff3e4', 1, 0.16 * clamp01((900 - d) / 500), d < 500);
  if (near) stroke(CITY.art, '#fff3e4', Math.max(0.8, zk * 0.7), 0.22 * clamp01((150 - d) / 90));
  if (near) stroke(CITY.st, '#fff3e4', Math.max(0.6, zk * 0.45), 0.16 * clamp01((40 - d) / 25));
  stroke(CITY.air, '#fff3e4', Math.max(1.5, zk * 2.2), 0.4 * clamp01((400 - d) / 250), d < 400);
  ctx.beginPath(); let anyH = false; for (const pts of CITY.hw) { if (d < 400 && !nearView(pts)) continue; if (line(pts)) anyH = true; }
  if (anyH) glow('#ffb547', [[Math.max(4, zk * 5), 0.08], [Math.max(1.2, zk * 1.6), 0.75]]);
  ctx.globalAlpha = 1;
}
// Buildings: extruded blocks, far to near, lit from one side; towers glow at the roof line.
const LIGHT = [Math.cos(0.9), Math.sin(0.9)];
function drawBuildings() {
  if (!CITY || cam.dist > 60) return;
  const fade = clamp01((60 - cam.dist) / 25), ex = 2.4, minH = cam.dist > 30 ? 0.03 : 0;
  const vis = [];
  for (const b of CITY.bld) {
    if (b.h < minH) continue;
    const q = proj(b.cx, b.cy, 0);
    if (!q || q[0] < -80 || q[0] > cw + 80 || q[1] < -200 || q[1] > ch + 80) continue;
    vis.push([q[2], b]);
  }
  vis.sort((a, b) => b[0] - a[0]);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineJoin = 'miter';
  for (const [, b] of vis) {
    const n = b.n, P = b.pts, H = b.h * ex, base = [], roof = [];
    let ok = true;
    for (let i = 0; i < n; i++) { const a = proj(P[2 * i], P[2 * i + 1], 0), r = proj(P[2 * i], P[2 * i + 1], H); if (!a || !r) { ok = false; break; } base.push(a); roof.push(r); }
    if (!ok) continue;
    const edge = b.tall >= 100 ? '#ffb547' : b.tall >= 40 ? '#ff2e7e' : '#19e3d0';
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = base[i], c = base[j], rc = roof[j], ra = roof[i];
      const sa = (c[0] - a[0]) * (ra[1] - a[1]) - (c[1] - a[1]) * (ra[0] - a[0]);
      if (sa <= 0) continue;
      const ex2 = P[2 * j] - P[2 * i], ey2 = P[2 * j + 1] - P[2 * i + 1], L = Math.hypot(ex2, ey2) || 1;
      const lit = 0.55 + 0.45 * ((ey2 / L) * LIGHT[0] - (ex2 / L) * LIGHT[1]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(rc[0], rc[1]); ctx.lineTo(ra[0], ra[1]); ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(30 + 34 * lit)},${Math.round(22 + 20 * lit)},${Math.round(44 + 40 * lit)},${0.96 * fade})`; ctx.fill();
    }
    ctx.beginPath(); roof.forEach((r, i) => i ? ctx.lineTo(r[0], r[1]) : ctx.moveTo(r[0], r[1])); ctx.closePath();
    ctx.fillStyle = `rgba(38,28,52,${fade})`; ctx.fill();
    ctx.globalAlpha = fade * (b.tall >= 40 ? 0.95 : 0.45); ctx.lineWidth = b.tall >= 40 ? 1.3 : 0.8; ctx.strokeStyle = edge; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.lineJoin = 'round';
}
function render(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const zoomK = Math.min(1.6, Math.max(0.6, 500 / cam.dist));

  // sea grid, 50 km
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(25,227,208,0.07)'; ctx.lineWidth = 1;
  const g0x = Math.floor((bx0 - 300) / 50) * 50, g1x = bx1 + 300, g0y = Math.floor((by0 - 250) / 50) * 50, g1y = by1 + 250;
  ctx.beginPath();
  for (let x = g0x; x <= g1x; x += 50) for (let y = g0y; y < g1y; y += 50) { const a = proj(x, y), b = proj(x, y + 50); if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } }
  for (let y = g0y; y <= g1y; y += 50) for (let x = g0x; x < g1x; x += 50) { const a = proj(x, y), b = proj(x + 50, y); if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } }
  ctx.stroke();

  // land: a faint fill, a "floor" outline below sea level and struts, then the neon coast
  const wall = 7;
  ctx.globalCompositeOperation = 'source-over';
  for (const r of land) { if (fillRing(r)) { ctx.fillStyle = 'rgba(255,46,126,0.045)'; ctx.fill(); } }
  ctx.globalCompositeOperation = 'lighter';
  if (cam.pitch > 0.25) {
    land.forEach((r, i) => { if (path(r, -wall, 'coast', borders[i])) glow('#19e3d0', [[3, 0.08], [1, 0.35]]); });
    ctx.beginPath();
    for (const r of land) for (let i = 0; i < r.length; i += r.length > 100 ? 6 : 3) { const a = proj(r[i][0], r[i][1], 0), b = proj(r[i][0], r[i][1], -wall); if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } }
    ctx.strokeStyle = 'rgba(25,227,208,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  }
  // Near Vice City the detailed shore takes over, so the coarse state outline steps back.
  const coastA = 1 - 0.85 * (metroNear() ? clamp01((260 - cam.dist) / 120) : 0);
  land.forEach((r, i) => { if (path(r, 0, 'coast', borders[i])) glow('#ff2e7e', [[9, 0.07 * coastA], [4.5, 0.18 * coastA], [1.6, 0.95 * coastA]]); });
  ctx.setLineDash([6, 6]);
  land.forEach((r, i) => { if (borders[i].size && path(r, 0, 'border', borders[i])) glow('#b7aeb9', [[1.2, 0.45]]); });
  ctx.setLineDash([]);
  for (const l of lakes) { if (path(l.ring)) { glow('#19e3d0', [[6, 0.1], [1.4, 0.85]]); } }
  drawCity();
  drawBuildings();

  // region labels
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of MAP.regions) {
    const p = proj(...W(r.anchor), 2); if (!p || p[2] > cam.dist * 2.4) continue;
    const size = Math.max(11, Math.min(34, 22 * focal() / p[2]));
    const dim = state.region && state.region !== r.id;
    ctx.font = `400 ${size}px Anton, Impact, sans-serif`;
    ctx.globalAlpha = (dim ? 0.25 : 0.92) * (size >= 34 ? 0.45 : 1);
    ctx.shadowColor = 'rgba(255,46,126,0.8)'; ctx.shadowBlur = 14;
    const gr = ctx.createLinearGradient(p[0] - size * 3, 0, p[0] + size * 3, 0);
    gr.addColorStop(0, '#ff2e7e'); gr.addColorStop(1, '#ff8a1f');
    ctx.fillStyle = gr; ctx.fillText(r.name.toUpperCase(), p[0], p[1]);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  // area labels when zoomed in
  // place names fade in by size: towns first, then keys, parks and water, then districts and islands
  const SHOW = { county: 520, town: 380, key: 140, park: 160, lake: 200, island: 60, district: 45 };
  ctx.font = '700 11px "DM Sans", system-ui, sans-serif';
  for (const a of MAP.areas) {
    const lim = SHOW[a.kind] || 380; if (cam.dist > lim) continue;
    const p = proj(...W(a.pos), 0.05); if (!p || p[2] > cam.dist * 2.2 || p[0] < 0 || p[0] > cw || p[1] < 0 || p[1] > ch) continue;
    ctx.globalAlpha = Math.min(0.85, (lim - cam.dist) / (lim * 0.4));
    ctx.fillStyle = a.kind === 'lake' ? '#7ab8ff' : a.kind === 'park' ? '#4dff88' : '#fff3e4';
    ctx.strokeStyle = 'rgba(11,10,12,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText(a.name.toUpperCase(), p[0], p[1]); ctx.fillText(a.name.toUpperCase(), p[0], p[1]);
  }
  ctx.globalAlpha = 1;

  // pins, far to near
  hitList = [];
  const pulse = selected && !RM ? (Math.sin((t || 0) / 260) + 1) / 2 : 0;
  const beam = cam.dist * 0.075;
  const items = [];
  for (const p of placed) {
    if (!visible(p)) continue;
    const base = proj(p.w[0], p.w[1], 0), top = proj(p.w[0], p.w[1], beam);
    if (!base || !top) continue;
    items.push({ p, base, top });
  }
  items.sort((a, b) => b.base[2] - a.base[2]);
  ctx.globalCompositeOperation = 'lighter';
  for (const { p, base, top } of items) {
    const col = CATS[p.cat].color, isSel = selected === p, isHov = hover === p;
    // certainty ring on the ground: wide when only the region is known
    const rad = p.precision === 'region' ? 22 : p.precision === 'area' ? (p.region === 'vice-city' ? 1.2 : 3) : 0.15;
    if (isSel || isHov || cam.dist < 500) {
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, q = proj(p.w[0] + Math.cos(a) * rad, p.w[1] + Math.sin(a) * rad); if (q) i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.setLineDash(p.precision === 'region' ? [4, 5] : []);
      ctx.strokeStyle = col; ctx.globalAlpha = isSel ? 0.6 : 0.22; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // beam
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]);
    glow(col, isSel ? [[10, 0.12], [5, 0.3], [2, 1]] : [[6, 0.1], [3, 0.22], [1.3, 0.9]]);
    // head
    const r = (isSel ? 7 + pulse * 3 : isHov ? 7 : 4.5) * zoomK;
    ctx.beginPath(); ctx.moveTo(top[0], top[1] - r); ctx.lineTo(top[0] + r, top[1]); ctx.lineTo(top[0], top[1] + r); ctx.lineTo(top[0] - r, top[1]); ctx.closePath();
    ctx.fillStyle = col; ctx.globalAlpha = 0.95; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(top[0], top[1], r * 2.4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.globalAlpha = isSel ? 0.22 : 0.1; ctx.fill(); ctx.globalAlpha = 1;
    hitList.push({ p, x: top[0], y: top[1], bx: base[0], by: base[1] });
  }
  ctx.globalCompositeOperation = 'source-over';
  // name tags for the selected pin and, when close, for every pin
  ctx.font = '700 12px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'left';
  const near = cam.dist < 130 ? [...hitList].filter((it) => { const q = proj(it.p.w[0], it.p.w[1]); return q && q[2] < cam.dist * 2.2; }).sort((a, b) => (a.x - CX()) ** 2 + (a.y - CY()) ** 2 - (b.x - CX()) ** 2 - (b.y - CY()) ** 2).slice(0, 10) : [];
  const taken = [], free4 = (x, y, w, hh) => !taken.some((r) => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + hh > r[1]);
  const tags = [...hitList.filter((it) => it.p === selected), ...near.filter((it) => it.p !== selected)].slice(0, cw < 600 ? 6 : 10);
  for (const it of tags) {
    const label = it.p.name.length > 34 ? it.p.name.slice(0, 32) + '…' : it.p.name, w = ctx.measureText(label).width + 12;
    if (it.p !== selected && !free4(it.x + 12, it.y - 10, w, 20)) continue;
    taken.push([it.x + 12, it.y - 10, w, 20]);
    ctx.fillStyle = 'rgba(11,10,12,0.85)'; ctx.fillRect(it.x + 12, it.y - 10, w, 20);
    ctx.fillStyle = it.p === selected ? '#ffd23f' : '#fff3e4'; ctx.fillText(label, it.x + 18, it.y + 1);
  }
  el('needle').style.transform = `rotate(${-cam.yaw}rad)`;
}

/* ---------- size ---------- */
function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = r.width; ch = r.height;
  measureFree();
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  draw();
}
new ResizeObserver(resize).observe(canvas);

/* ---------- picking ---------- */
function pick(sx, sy) {
  let best = null, bd = 24 * 24;
  for (const it of hitList) {
    for (const [x, y] of [[it.x, it.y], [it.bx, it.by]]) { const d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = it.p; } }
  }
  return best;
}

/* ---------- pointer: drag pans, right-drag / shift-drag turns, wheel and pinch zoom ---------- */
const pointers = new Map();
let drag = null, moved = 0;
const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  moved = 0; anim = null;
  drag = { mode: (e.button === 2 || e.shiftKey) ? 'turn' : 'pan', last: local(e) };
  if (pointers.size === 2) drag = { mode: 'pinch', ...pinchInfo() };
  canvas.classList.add('dragging');
  el('hint').hidden = true;
});
function pinchInfo() { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; }
canvas.addEventListener('pointermove', (e) => {
  const pt = local(e);
  if (!drag) { const p = pick(...pt); if (p !== hover) { hover = p; canvas.classList.toggle('over', !!p); showTip(p, pt); draw(); } else if (p) showTip(p, pt); return; }
  pointers.set(e.pointerId, pt);
  if (drag.mode === 'pinch' && pointers.size === 2) {
    const now = pinchInfo();
    zoomAt(now.mid, drag.d / Math.max(1, now.d));
    cam.yaw -= now.ang - drag.ang;
    panBy(drag.mid, now.mid);
    Object.assign(drag, now); moved += 10; draw(); return;
  }
  const [lx, ly] = drag.last;
  moved += Math.abs(pt[0] - lx) + Math.abs(pt[1] - ly);
  if (drag.mode === 'turn') {
    cam.yaw += (pt[0] - lx) * 0.006;
    cam.pitch = Math.min(1.12, Math.max(0, cam.pitch + (pt[1] - ly) * 0.004));
    el('tilt').setAttribute('aria-pressed', String(cam.pitch > 0.3));
  } else panBy([lx, ly], pt);
  drag.last = pt; draw();
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 1) { drag = { mode: 'pan', last: [...pointers.values()][0] }; return; }
  if (pointers.size) return;
  canvas.classList.remove('dragging');
  if (drag && moved < 6 && e.type === 'pointerup') { const p = pick(...local(e)); select(p, true); }
  drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; showTip(null); draw(); } });
function panBy(from, to) {
  const a = unproj(...from), b = unproj(...to);
  if (!a || !b) return;
  cam.x += a[0] - b[0]; cam.y += a[1] - b[1];
  clampCam();
}
function zoomAt(pt, k) {
  const before = unproj(...pt);
  cam.dist = Math.min(MAX_D, Math.max(MIN_D, cam.dist * k));
  const after = unproj(...pt);
  if (before && after) { cam.x += before[0] - after[0]; cam.y += before[1] - after[1]; }
  clampCam();
}
function clampCam() { cam.x = Math.min(bx1 + 150, Math.max(bx0 - 150, cam.x)); cam.y = Math.min(by1 + 150, Math.max(by0 - 150, cam.y)); }
canvas.addEventListener('wheel', (e) => { e.preventDefault(); anim = null; zoomAt(local(e), Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))); draw(); }, { passive: false });
canvas.addEventListener('dblclick', (e) => { const pt = local(e), g = unproj(...pt); if (g) fly({ x: g[0], y: g[1], dist: Math.max(MIN_D, cam.dist * 0.45) }); });
canvas.addEventListener('keydown', (e) => {
  const step = cam.dist * 0.08, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const move = (dx, dy) => { cam.x += dx * c + dy * s; cam.y += -dx * s + dy * c; clampCam(); };
  const k = e.key;
  if (k === 'ArrowLeft') move(-step, 0); else if (k === 'ArrowRight') move(step, 0);
  else if (k === 'ArrowUp') move(0, step); else if (k === 'ArrowDown') move(0, -step);
  else if (k === '+' || k === '=') cam.dist = Math.max(MIN_D, cam.dist * 0.8);
  else if (k === '-' || k === '_') cam.dist = Math.min(MAX_D, cam.dist * 1.25);
  else if (k === '[') cam.yaw -= 0.15; else if (k === ']') cam.yaw += 0.15;
  else if (k === 'Escape') { select(null); return; }
  else return;
  e.preventDefault(); draw();
});

/* ---------- tooltip ---------- */
const tip = el('tip');
function showTip(p, pt) {
  if (!p || !pt) { tip.hidden = true; return; }
  tip.textContent = p.name; tip.hidden = false;
  const it = hitList.find((x) => x.p === p);
  tip.style.left = (it ? it.x : pt[0]) + 'px'; tip.style.top = (it ? it.y : pt[1]) + 'px';
  tip.style.borderColor = CATS[p.cat].color;
}

/* ---------- buttons ---------- */
el('zin').addEventListener('click', () => fly({ dist: Math.max(MIN_D, cam.dist * 0.6) }));
el('zout').addEventListener('click', () => fly({ dist: Math.min(MAX_D, cam.dist * 1.6) }));
el('rot').addEventListener('click', () => fly({ yaw: cam.yaw + Math.PI / 4 }));
el('compass').addEventListener('click', () => fly({ yaw: 0 }));
el('tilt').addEventListener('click', () => { const on = cam.pitch < 0.3; el('tilt').setAttribute('aria-pressed', String(on)); if (selected) fly({ pitch: on ? PITCH3D : 0 }); else fitAll(placed.filter(visible), true, on ? PITCH3D : 0); });
el('home').addEventListener('click', () => fitAll(placed.filter(visible)));

/* ---------- latest patch, for staleness warnings ---------- */
const latest = FEED.latestPatch && FEED.latestPatch.version ? FEED.latestPatch : null;

/* ---------- detail card ---------- */
const card = el('card');
const PREC = {
  spot: 'Position: checked on the spot.',
  area: 'Position: approximate. The pin sits in the town or district the source names; use the in-game map for the exact spot.',
  region: 'Position: rough. The source only names the region, so the pin marks the general area (dashed ring).',
};
function select(p, fromMap = false, focus = false) {
  selected = p || null;
  showTip(null);
  el('main').querySelector('.stage').classList.toggle('card-open', !!p);
  if (!p) { card.hidden = true; measureFree(); history.replaceState(null, '', location.pathname + location.search); draw(); return; }
  const cat = CATS[p.cat];
  el('card-status').className = 'lab ' + p.status; el('card-status').textContent = p.status;
  el('card-cat').textContent = cat.label.replace(/s$/, ''); el('card-cat').style.setProperty('--c', cat.color);
  el('card-name').textContent = p.name;
  el('card-where').textContent = [p.area, REG[p.region]?.name || (p.region === null ? 'region not confirmed' : '')].filter(Boolean).join(' · ');
  el('card-prec').textContent = p.w ? PREC[p.precision] : 'Not on the map yet: no source says exactly where.';
  el('card-summary').textContent = p.summary;
  const how = el('card-how'); how.replaceChildren();
  if (p.how?.length) how.append(h('h3', { text: 'How' }), h('ol', {}, ...p.how.map((x) => h('li', { text: x }))));
  const dl = el('card-dl'); dl.replaceChildren();
  if (p.reward) dl.append(h('dt', { text: 'You get' }), h('dd', { text: p.reward }));
  if (p.needs) dl.append(h('dt', { text: 'Needs' }), h('dd', { text: p.needs }));
  if (p.checked) dl.append(h('dt', { text: 'Tested' }), h('dd', { text: `${p.checked.on} on ${p.checked.platform}, v${p.checked.version}` }));
  const src = el('card-src'); src.replaceChildren(...p.sources.map((s) => h('li', {}, safe(s.url) ? h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.publisher }) : s.publisher, s.read ? h('small', { text: ' · read ' + dateFmt.format(D(s.read)) }) : null)));
  const lastRead = p.sources.map((s) => s.read).filter(Boolean).sort().pop();
  let warn = p.status === 'Tested' ? '' : 'Not tested by us yet.';
  if (latest && lastRead && D(latest.date) > D(lastRead) && !(p.checked && p.checked.version === latest.version)) warn = `Read before update ${latest.version} (${dateFmt.format(D(latest.date))}). It may have changed; check in game.`;
  el('card-warn').textContent = warn;
  el('card-out').textContent = '';
  el('card-street').hidden = !p.w;
  card.hidden = false;
  history.replaceState(null, '', '#p=' + p.id);
  if (p.w && !fromMap) {
    measureFree();
    fly({ x: p.w[0], y: p.w[1], dist: p.precision === 'region' ? 160 : p.region === 'vice-city' ? 3.2 : 24, pitch: cam.pitch < 0.3 ? cam.pitch : PITCH3D });
  } else draw();
  if (focus) card.focus();
}
el('card-x').addEventListener('click', () => { select(null); canvas.focus(); });
// Street level: fly right down onto the pin, tilted, so the blocks around it stand up.
el('card-street').addEventListener('click', () => {
  if (!selected || !selected.w) return;
  el('tilt').setAttribute('aria-pressed', 'true');
  fly({ x: selected.w[0], y: selected.w[1], dist: selected.region === 'vice-city' ? 1.6 : 6, pitch: 1.02 });
});
el('card-big').addEventListener('click', () => {
  const on = !card.classList.contains('big');
  card.classList.toggle('big', on); el('card-big').setAttribute('aria-pressed', String(on));
  el('card-big').textContent = on ? 'Smaller card' : 'Enlarge card';
  measureFree(); draw();
});
el('card-share').addEventListener('click', async () => {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); el('card-out').textContent = 'Link copied.'; } catch (e) { el('card-out').textContent = url; }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden && document.activeElement !== canvas) { select(null); canvas.focus(); } });

/* ---------- HUD: categories, region, search ---------- */
const catsBox = el('cats');
for (const [id, c] of Object.entries(CATS)) {
  const n = places.filter((p) => p.cat === id).length;
  if (!n) continue;
  const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', style: `--c:${c.color}` }, h('i', { 'aria-hidden': 'true' }), `${c.label} ${n}`);
  b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); on ? state.cats.add(id) : state.cats.delete(id); refresh(); });
  catsBox.append(b);
}
const regSel = el('region');
for (const r of MAP.regions) regSel.append(h('option', { value: r.id, text: r.name }));
regSel.addEventListener('change', () => { state.region = regSel.value; refresh(); const list = placed.filter(visible); if (list.length) fitAll(list); });
let qt = 0;
el('q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); refresh(); const list = placed.filter(visible); if (state.q && list.length) fitAll(list); }, 160); });
const hud = el('hud'), tog = el('hud-toggle');
tog.addEventListener('click', () => { const o = hud.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); measureFree(); draw(); });
function refresh() {
  const n = placed.filter(visible).length;
  el('count').textContent = `${n} of ${placed.length} spots on the map · updated ${dateFmt.format(D(MAP.updated))}`;
  if (selected && !visible(selected)) select(null);
  draw();
}

/* ---------- lists below the map ---------- */
function row(p) {
  const b = h('button', { type: 'button', style: `--c:${CATS[p.cat].color}` }, h('i', { 'aria-hidden': 'true' }), h('span', {}, h('b', { text: p.name }), h('small', { text: `${CATS[p.cat].label.replace(/s$/, '')} · ${p.area}` })), h('span', { class: 'lab ' + p.status, text: p.status }));
  b.addEventListener('click', () => { el('main').scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); select(p, false, true); });
  return h('li', {}, b);
}
const plist = el('plist');
const groups = [...MAP.regions.map((r) => ({ name: r.name, blurb: r.blurb, items: placed.filter((p) => p.region === r.id) })), { name: 'Region not confirmed', blurb: 'Placed by the town a guide names; which official region it belongs to is not confirmed yet.', items: placed.filter((p) => p.region === null) }];
for (const g of groups) if (g.items.length) plist.append(h('div', { class: 'reg' }, h('h3', {}, g.name, h('small', { text: g.blurb })), h('ul', { class: 'plist' }, ...g.items.sort((a, b) => a.name.localeCompare(b.name)).map(row))));
const unplaced = places.filter((p) => !p.w);
const ulist = el('ulist');
if (unplaced.length) ulist.append(h('div', { class: 'reg' }, h('ul', { class: 'plist' }, ...unplaced.map(row)))); else el('unplaced').hidden = true;
const leads = el('leads');
const fresh = (FEED.intel || []).filter((i) => (i.cat === 'secret' || i.cat === 'cheat') && i.status !== 'Official' && safe(i.url)).slice(0, 8);
for (const i of fresh) leads.append(h('div', { class: 'lead' }, h('span', { class: 'lab ' + i.status, text: i.status }), ' ', h('a', { href: i.url, target: '_blank', rel: 'noopener', text: i.title }), h('small', { text: i.publisher + (i.date ? ' · ' + dateFmt.format(D(i.date)) : '') })));
if (!fresh.length) el('fresh').hidden = true;

/* ---------- start ---------- */
resize();
refresh();
const fromHash = (location.hash.match(/^#p=([a-z0-9-]+)$/) || [])[1];
const start = fromHash && places.find((p) => p.id === fromHash);
fitAll(placed, false);
if (start) select(start);
addEventListener('hashchange', () => { const id = (location.hash.match(/^#p=([a-z0-9-]+)$/) || [])[1]; const p = id && places.find((x) => x.id === id); if (p && p !== selected) select(p); });
if (document.fonts?.ready) document.fonts.ready.then(draw);
setTimeout(loadCity, 60);
})();
