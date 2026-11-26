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
// Bigger places win when names would collide.
const KIND_RANK = { county: 0, town: 1, key: 2, lake: 3, park: 4, island: 5, district: 6 };
const AREAS_BY_RANK = [...MAP.areas].sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9));
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
let CITY = null, cityFade = 0, cityT0 = 0;
const METRO = (() => { const a = W([-80.55, 25.40]), b = W([-80.03, 26.35]); return { x0: a[0], y0: a[1], x1: b[0], y1: b[1] }; })();
function decodeLine(a) {
  const n = a.length >> 1, o = new Float32Array(n * 2); let X = 0, Y = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    X += a[2 * i]; Y += a[2 * i + 1];
    const x = (X / 1e5 - LON0) * KX, y = (Y / 1e5 - LAT0) * KY;
    o[2 * i] = x; o[2 * i + 1] = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  // Bounding box, so a frame can skip a line far from the view without projecting any of its points.
  o.bb = [x0, y0, x1, y1];
  return o;
}
function decodeCity(c) {
  const L = (k) => (c[k] || []).map(decodeLine);
  const bld = (c.bld || []).map(([hm, a]) => {
    let pts = decodeLine(a); const n = pts.length >> 1;
    let ar = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; ar += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; cx += pts[2 * i]; cy += pts[2 * i + 1]; }
    if (ar < 0) { const r = new Float32Array(pts.length); for (let i = 0; i < n; i++) { r[2 * i] = pts[2 * (n - 1 - i)]; r[2 * i + 1] = pts[2 * (n - 1 - i) + 1]; } pts = r; }
    cx /= n; cy /= n; let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(pts[2 * i] - cx, pts[2 * i + 1] - cy));
    return { h: hm / 1000, pts, n, cx, cy, r, tall: hm, cls: hm >= 100 ? 2 : hm >= 40 ? 1 : 0, dep: 0 };
  });
  return { hw: L('hw'), pri: L('pri'), art: L('art'), st: L('st'), coast: L('coast'), air: L('air'),
    park: (c.park || []).map(([t, a]) => ({ t, pts: decodeLine(a) })), bld, source: c.source };
}
function loadCity() {
  const s = document.createElement('script');
  s.src = 'data/city.js'; s.async = true;
  s.onload = () => { if (window.LEONIDA_CITY) { CITY = decodeCity(window.LEONIDA_CITY); window.LEONIDA_CITY = null; cityT0 = performance.now(); cityFade = RM ? 1 : 0; draw(); } };
  document.body.append(s);
}

/* ---------- camera ---------- */
// ctx is the canvas being drawn on: the map itself, or for a moment the city cache (see below).
const canvas = el('map'); let ctx = canvas.getContext('2d');
let cw = 0, ch = 0, dpr = 1;
const cam = { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2 - 20, dist: 900, yaw: -0.18, pitch: 0.92 };
const PITCH3D = 0.92, MIN_D = 1.2, MAX_D = 1600;
// The free part of the canvas: not covered by the filter panel or the open card. The camera
// centres and fits inside it, so a selected pin is never hidden behind a panel.
let free = { l: 0, r: 0, t: 0, b: 0 }, blocks = [], freeVer = 0;
function measureFree() {
  const c = canvas.getBoundingClientRect(), wide = cw > 860;
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left - c.left, r: r.right - c.left, t: r.top - c.top, b: r.bottom - c.top, w: r.width }; };
  free = { l: 0, r: cw, t: 0, b: ch };
  const hr = el('hud').getBoundingClientRect();
  if (wide) free.l = Math.min(cw * 0.45, hr.right - c.left + 12); else free.t = Math.min(ch * 0.5, hr.bottom - c.top + 8);
  if (!el('card').hidden) { const k = el('card').getBoundingClientRect(); if (wide) free.r = Math.max(free.l + 200, k.left - c.left - 12); else free.b = Math.max(free.t + 140, k.top - c.top - 8); }
  const ctrl = box($('.ctrl'));
  if (!wide) free.r = Math.min(cw - 58, ctrl.w ? ctrl.l - 6 : cw - 58);
  // Panels and buttons that sit on top of the canvas. Names are never drawn under them, where a
  // button's edge would cut straight through the letters.
  blocks = [box(el('hud')), ctrl, box(el('compass')), ...(el('card').hidden ? [] : [box(el('card'))])].filter((b) => b.w > 0);
  freeVer++;
}
/** True when a label box is on the canvas and clear of every panel and button. */
function roomFor(x, y, w, hh) {
  if (x < 2 || y < 2 || x + w > cw - 2 || y + hh > ch - 2) return false;
  for (const b of blocks) if (x < b.r + 4 && x + w > b.l - 4 && y < b.b + 4 && y + hh > b.t - 4) return false;
  return true;
}
// Flat view: centred. Tilted: the ground plane sits a little lower, like a horizon.
// The camera's sines, cosines, focal length and centre are worked out once per camera change, not
// once per point: a city frame projects a few hundred thousand points.
const PJ = { x: NaN, y: NaN, dist: NaN, yaw: NaN, pitch: NaN, fv: -1, c: 1, s: 0, cp: 1, sp: 0, f: 1, cx: 0, cy: 0, near: 0 };
let PJ_OVR = null;
function pj() {
  if (PJ_OVR) return PJ_OVR;
  if (PJ.x !== cam.x || PJ.y !== cam.y || PJ.dist !== cam.dist || PJ.yaw !== cam.yaw || PJ.pitch !== cam.pitch || PJ.fv !== freeVer) {
    PJ.x = cam.x; PJ.y = cam.y; PJ.dist = cam.dist; PJ.yaw = cam.yaw; PJ.pitch = cam.pitch; PJ.fv = freeVer;
    PJ.c = Math.cos(cam.yaw); PJ.s = Math.sin(cam.yaw); PJ.cp = Math.cos(cam.pitch); PJ.sp = Math.sin(cam.pitch);
    PJ.cx = (free.l + free.r) / 2;
    PJ.cy = free.t + (free.b - free.t) * (0.5 + 0.06 * Math.min(1, cam.pitch / 0.92));
    PJ.f = Math.min(free.r - free.l, (free.b - free.t) * 1.25) * 1.05;
    PJ.near = cam.dist * 0.08;
  }
  return PJ;
}
const CX = () => pj().cx, CY = () => pj().cy, focal = () => pj().f;
function proj(x, y, z = 0) {
  const P = pj(), dx = x - P.x, dy = y - P.y;
  const xr = dx * P.c - dy * P.s, yr = dx * P.s + dy * P.c;
  const depth = P.dist + yr * P.sp - z * P.cp;
  if (depth < P.near) return null;
  const f = P.f / depth;
  return [P.cx + xr * f, P.cy - (yr * P.cp + z * P.sp) * f, depth];
}
/** Screen point → ground (z = 0) point, for panning and zooming under the cursor. */
function unproj(sx, sy) {
  const P = pj(), a = (sx - P.cx) / P.f, b = -(sy - P.cy) / P.f;
  const den = P.cp - b * P.sp;
  if (den <= 0.02) return null;
  const yr = b * P.dist / den, depth = P.dist + yr * P.sp, xr = a * depth;
  return [P.x + xr * P.c + yr * P.s, P.y - xr * P.s + yr * P.c];
}
function fitAll(list = placed, animate = true, pitch = cam.pitch) {
  // Exact fit: try camera distances and keep the closest one where every pin (base and beam top)
  // and, for the full view, the whole coastline land inside the free area with a margin.
  const pts = list.length ? list.map((p) => p.w) : [];
  const labelPts = new Set();
  if (!list.length || list.length === placed.length) { for (const r of land) for (let i = 0; i < r.length; i += 4) pts.push(r[i]); for (const r of MAP.regions) { const q = W(r.anchor); labelPts.add(q); pts.push(q); } }
  if (!pts.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const save = { ...cam }, m = 28;
  // The hint line only takes room when it is actually shown (it is hidden on phones).
  const hintH = el('hint').hidden || getComputedStyle(el('hint')).display === 'none' ? 0 : 34;
  Object.assign(cam, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, pitch });
  const fits = (d) => {
    cam.dist = d;
    const beam = d * 0.075;
    for (const pt of pts) for (const z of [0, beam]) {
      const q = proj(pt[0], pt[1], z), mx = labelPts.has(pt) ? m + Math.min(64, (free.r - free.l) * 0.07) : m;
      if (!q || q[0] < free.l + mx || q[0] > free.r - mx || q[1] < free.t + m || q[1] > free.b - m - hintH) return false;
    }
    return true;
  };
  const search = () => { let lo = 60, hi = MAX_D; if (!fits(hi)) return hi; for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; fits(mid) ? (hi = mid) : (lo = mid); } return hi; };
  // A tilted view squeezes the far side, so the fitted shape sits low. Centre its on-screen box, then fit again.
  for (let it = 0; it < 4; it++) {
    cam.dist = search();
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const [x, y] of pts) for (const z of [0, cam.dist * 0.075]) { const q = proj(x, y, z); if (!q) continue; sx0 = Math.min(sx0, q[0]); sx1 = Math.max(sx1, q[0]); sy0 = Math.min(sy0, q[1]); sy1 = Math.max(sy1, q[1]); }
    const dx = (free.l + free.r) / 2 - (sx0 + sx1) / 2, dy = (free.t + free.b - hintH) / 2 - (sy0 + sy1) / 2;
    if (!isFinite(dx) || (Math.abs(dx) < 3 && Math.abs(dy) < 3)) break;
    const a = unproj(CX(), CY()), b = unproj(CX() - dx, CY() - dy);
    if (!a || !b) break;
    cam.x += b[0] - a[0]; cam.y += b[1] - a[1];
  }
  const to = { x: cam.x, y: cam.y, dist: search(), pitch };
  Object.assign(cam, save);
  fly(to, animate);
}

/* ---------- animation (only while something moves) ---------- */
let anim = null, dirty = true, raf = 0, zoomTo = null, lastT = 0;
// While the map moves, frames trade far detail for speed; one full-detail frame follows when it stops.
let busyUntil = 0, settleT = 0;
function busy() { busyUntil = performance.now() + 160; clearTimeout(settleT); settleT = setTimeout(draw, 200); }
function fly(to, animate = true) {
  zoomTo = null;
  if (!animate || RM) { Object.assign(cam, to); anim = null; draw(); return; }
  const from = { ...cam }, dest = { ...cam, ...to };
  anim = { from, to: dest, t0: performance.now(), dur: Math.min(1200, 600 + 70 * Math.abs(Math.log2(dest.dist / from.dist))) };
  loop();
}
/** Wheel and keys: the zoom eases toward a target instead of jumping a step per notch. */
function zoomBy(k, at) {
  const base = zoomTo ? zoomTo.dist : cam.dist;
  anim = null;
  zoomTo = { dist: Math.min(MAX_D, Math.max(MIN_D, base * k)), at: at || [CX(), CY()] };
  if (RM) { zoomAt(zoomTo.at, zoomTo.dist / cam.dist); zoomTo = null; draw(); return; }
  busy(); loop();
}
function loop() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(t) {
  raf = 0;
  const dt = lastT ? Math.min(48, Math.max(4, t - lastT)) : 16; lastT = t;
  if (anim) {
    const k = Math.min(1, (t - anim.t0) / anim.dur), e = 1 - Math.pow(1 - k, 3), A = anim.from, B = anim.to;
    for (const key of ['yaw', 'pitch']) cam[key] = A[key] + (B[key] - A[key]) * e;
    // Height moves on a log scale, so a flight from the whole state down to a street slows evenly. The
    // camera slides across in step with the height, so the target is in view early on the way down.
    const r = B.dist / A.dist, logz = Math.abs(Math.log(r)) > 0.05;
    cam.dist = logz ? A.dist * Math.pow(r, e) : A.dist + (B.dist - A.dist) * e;
    const pe = logz ? (cam.dist - A.dist) / (B.dist - A.dist) : e;
    cam.x = A.x + (B.x - A.x) * pe; cam.y = A.y + (B.y - A.y) * pe;
    if (k >= 1) { anim = null; Object.assign(cam, { x: B.x, y: B.y, dist: B.dist, yaw: B.yaw, pitch: B.pitch }); }
    dirty = true;
  }
  if (zoomTo) {
    const left = Math.log(zoomTo.dist / cam.dist);
    if (Math.abs(left) < 0.004) { zoomAt(zoomTo.at, zoomTo.dist / cam.dist); zoomTo = null; }
    else zoomAt(zoomTo.at, Math.exp(left * (1 - Math.exp(-dt / 70))));
    dirty = true;
  }
  if (CITY && cityFade < 1) { cityFade = Math.min(1, (performance.now() - cityT0) / 700); dirty = true; }
  if (job && runJob(7)) dirty = true;
  if (dirty) { dirty = false; render(t); }
  if (anim || zoomTo || job || dirty || (CITY && cityFade < 1)) loop(); else lastT = 0;
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
  for (const [w, a] of widths) { if (a < 0.012) continue; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); }
  ctx.globalAlpha = 1;
}
// thin: skip a point closer than this (squared, in px) to the last one drawn. Water, parks, streets and
// the shore use it: zoomed out, many of their points fall on the same pixel. Buildings keep every corner.
function line(pts, z = 0, close = false, thin = 0) {
  const P = pj(), n = pts.length >> 1, zs = z * P.sp, zc = z * P.cp, m = n + (close ? 1 : 0);
  let pen = false, any = false, lx = 0, ly = 0;
  for (let i = 0; i < m; i++) {
    const k = i < n ? i : 0, dx = pts[2 * k] - P.x, dy = pts[2 * k + 1] - P.y;
    const xr = dx * P.c - dy * P.s, yr = dx * P.s + dy * P.c, depth = P.dist + yr * P.sp - zc;
    if (depth < P.near) { pen = false; continue; }
    const f = P.f / depth, sx = P.cx + xr * f, sy = P.cy - (yr * P.cp + zs) * f;
    if (pen) { if (thin && i < m - 1 && (sx - lx) * (sx - lx) + (sy - ly) * (sy - ly) < thin) continue; ctx.lineTo(sx, sy); }
    else { ctx.moveTo(sx, sy); pen = true; }
    lx = sx; ly = sy; any = true;
  }
  return any;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Pin pictures, per category: a head (diamond of radius 8 with a halo of 17.6) in a 40 x 40 box, and a
// beam strip 16 wide (outer glow 12, middle 6, core 1.3, as the old three glow passes). Remade if the
// pixel ratio changes.
let pinSpr = null, pinSprDpr = 0;
function pinSprites() {
  if (pinSpr && pinSprDpr === dpr) return pinSpr;
  pinSpr = {}; pinSprDpr = dpr;
  for (const [id, c] of Object.entries(CATS)) {
    const head = document.createElement('canvas'); head.width = head.height = Math.ceil(40 * dpr);
    const h2 = head.getContext('2d'); h2.scale(dpr, dpr); h2.fillStyle = c.color;
    h2.globalAlpha = 0.08 / 0.95; h2.beginPath(); h2.arc(20, 20, 17.6, 0, Math.PI * 2); h2.fill();
    h2.globalAlpha = 1; h2.beginPath(); h2.moveTo(20, 12); h2.lineTo(28, 20); h2.lineTo(20, 28); h2.lineTo(12, 20); h2.closePath(); h2.fill();
    const beam = document.createElement('canvas'); beam.width = Math.ceil(16 * dpr); beam.height = Math.ceil(4 * dpr);
    const b2 = beam.getContext('2d'); b2.scale(dpr, dpr); b2.fillStyle = c.color;
    for (const [w, a] of [[12, 0.1], [6, 0.22], [1.3, 0.9]]) { b2.globalAlpha = a; b2.fillRect(8 - w / 2, 0, w, 4); }
    pinSpr[id] = { head, beam };
  }
  return pinSpr;
}
const RING = Array.from({ length: 29 }, (_, i) => [Math.cos(i / 28 * Math.PI * 2), Math.sin(i / 28 * Math.PI * 2)]);
/** Adds a pin's certainty ring to the current path (a new sub-path after any gap behind the camera). */
const ringRad = (p) => p.precision === 'region' ? 22 : p.precision === 'area' ? (p.region === 'vice-city' ? 1.2 : 3) : 0.15;
/** A ring is only worth drawing when it reads on screen: a few px across, and not wider than the view
 * (a 22 km ring seen from street level is just a curve far off screen, and costly to stroke). */
const ringFits = (p, base) => { const r = ringRad(p) * pj().f / base[2]; return r >= 2.5 && r <= Math.max(cw, ch) * 0.7; };
function pinRing(p) {
  const rad = ringRad(p);
  let pen = false, any = false;
  for (const [c, sn] of RING) { const q = proj(p.w[0] + c * rad, p.w[1] + sn * rad); if (!q) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } any = true; }
  return any;
}
// How far from the point the camera looks at anything can show: wider when tilted towards the horizon.
let VR2 = 0;
let viewPlanes = [];
function setViewRadius() {
  const P = pj(), radius = cam.dist * (1.5 + 7 * P.sp * P.sp);
  VR2 = radius * radius;
  const v = PJ_OVR ? VIEW : { x0: 0, y0: 0, x1: cw, y1: ch };
  const plane = (across, along, depth) => [
    across * P.c + along * P.s, -across * P.s + along * P.c, depth * P.dist
  ];
  const left = P.cx - v.x0 + 12, right = v.x1 - P.cx + 12;
  const top = P.cy - v.y0 + 12, bottom = v.y1 - P.cy + 12;
  viewPlanes = [
    plane(P.f, left * P.sp, left), plane(-P.f, right * P.sp, right),
    plane(0, top * P.sp - P.f * P.cp, top), plane(0, bottom * P.sp + P.f * P.cp, bottom)
  ];
}
/** Cheap test from a line's bounding box: could any of it be in view? */
function nearView(pts) {
  const b = pts.bb; if (!b) return true;
  const dx = Math.max(b[0] - cam.x, 0, cam.x - b[2]), dy = Math.max(b[1] - cam.y, 0, cam.y - b[3]);
  if (dx * dx + dy * dy >= VR2) return false;
  // Cull whole features against the screen edges before projecting individual vertices.
  // A ground rectangle outside any one of these linear planes is entirely invisible.
  return !viewPlanes.some(([a, c, k]) =>
    a * ((a >= 0 ? b[2] : b[0]) - cam.x) + c * ((c >= 0 ? b[3] : b[1]) - cam.y) + k < 0);

}
const metroNear = () => !!CITY && cam.x > METRO.x0 - 60 && cam.x < METRO.x1 + 60 && cam.y > METRO.y0 - 60 && cam.y < METRO.y1 + 60;
function strokeLines(list, color, w, a, test = true) {
  if (a <= 0.01) return; ctx.beginPath(); let any = false;
  for (const pts of list) { if (test && !nearView(pts)) continue; if (line(pts, 0, false, 1)) any = true; }
  if (any) { ctx.globalAlpha = a; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); ctx.globalAlpha = 1; }
}
// Highways, main roads and runways: statewide and cheap, drawn live on every frame.
function drawCityBase() {
  if (!CITY) return;
  const d = cam.dist, A = cityFade, zk = Math.min(3, Math.max(0.6, 60 / d));
  setViewRadius();
  ctx.lineJoin = 'bevel'; ctx.lineCap = 'butt'; ctx.globalCompositeOperation = 'lighter';
  strokeLines(CITY.pri, '#fff3e4', 1, 0.16 * clamp01((900 - d) / 500) * A, d < 500);
  strokeLines(CITY.air, '#fff3e4', Math.max(1.5, zk * 2.2), 0.4 * clamp01((400 - d) / 250) * A, d < 400);
  ctx.beginPath(); let anyH = false; for (const pts of CITY.hw) { if (d < 400 && !nearView(pts)) continue; if (line(pts, 0, false, 1)) anyH = true; }
  if (anyH) glow('#ffb547', [[Math.max(4, zk * 5), 0.08 * A], [Math.max(1.2, zk * 1.6), 0.75 * A]]);
  ctx.globalAlpha = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}
// Vice City detail: water and parks, the detailed shore and the street grid, drawn into the hidden
// picture as separate steps (a fill, one glow pass or one street layer each), so a frame never has to
// carry all of it. The current path carries over between steps: only the job draws on that canvas.
function cityDetailSteps(S, J) {
  const d = cam.dist, detail = clamp01((260 - d) / 120), zk = Math.min(3, Math.max(0.6, 60 / d));
  const setup = (op) => { setViewRadius(); ctx.lineJoin = 'bevel'; ctx.lineCap = 'butt'; ctx.globalCompositeOperation = op; };
  // Draw a few nearby polygons per step. A single path containing the entire
  // metro area forces the browser to tessellate distant and overlapping shapes together.
  if (detail > 0 && d < 140) {
    for (const water of [true, false]) {
      const shapes = CITY.park.filter(p => (p.t === 'w') === water && nearView(p.pts));
      for (let i = 0; i < shapes.length; i += 24) {
        S.push(heavy(3, () => {
          setup('source-over');
          ctx.fillStyle = water ? `rgba(30,110,220,${0.22 * detail})` : `rgba(77,255,136,${0.07 * detail})`;
          ctx.beginPath();
          for (let j = i; j < Math.min(i + 24, shapes.length); j++) line(shapes[j].pts, 0, true, 2);
          ctx.fill();
        }));
      }
    }
  }
  if (detail > 0) {
    let any = false;
    S.push(() => { setup('lighter'); ctx.beginPath(); for (const pts of CITY.coast) if (nearView(pts) && line(pts, 0, false, 1)) any = true; });
    for (const pass of [[6, 0.07], [3, 0.17], [1.4, 0.9]]) S.push(() => { if (any) { setup('lighter'); glow('#ff2e7e', [[pass[0], pass[1] * detail]]); } });
  }
  S.push(heavy(2, () => { setup('lighter'); strokeLines(CITY.art, '#fff3e4', Math.max(0.8, zk * 0.7), 0.22 * clamp01((150 - d) / 90)); }));
  S.push(() => { setup('lighter'); strokeLines(CITY.st, '#fff3e4', Math.max(0.6, zk * 0.45), 0.16 * clamp01((40 - d) / 25)); });
  S.push(() => { ctx.globalAlpha = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'source-over'; });
}

/* ---------- city cache ---------- */
// The dense part of the city (parks, the detailed shore, the street grid and 42,000 buildings) is a
// picture in a canvas of its own. While the map moves, that picture is laid onto the new view in thin
// horizontal bands (within a band the ground plane is close to a flat, affine stretch), which costs a
// few image copies instead of redrawing the city. A fresh picture is drawn in a second, hidden canvas a
// few milliseconds per frame, so no single frame carries the whole city; when it is done the two swap.
// Pins, names, highways and the coast stay live and exact.
// A new picture fades in over the last one (FADE ms) instead of replacing it in one frame, and each
// picture's spare margin fades to nothing at its outer edge, so zooming out shows the city thinning
// at the edges instead of a hard-edged slab.
const mk = () => { const cv = document.createElement('canvas'); return { cv, c2: cv.getContext('2d') }; };
let front = mk(), back = mk(), prev = mk(), job = null;
const FADE = 220, MARGIN = 0.12;
/** Marks a step as costly to paint (a frame takes at most three units). */
const heavy = (w, fn) => Object.assign(fn, { w });
const cache = { P: null, M: [0, 0], q: '', ok: false, d: 0, w: 0, h: 0 };
const old = { P: null, M: [0, 0], q: '', ok: false, d: 0, w: 0, h: 0, t: 0 };   // the picture fading out
let VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
const cityDetailOn = () => !!CITY && metroNear() && cam.dist < 260;
/** Starts a fresh city picture for the current camera ('full' at rest, 'live' = quicker, while moving). */
function startJob(q) {
  const mx = Math.round(cw * MARGIN), my = Math.round(ch * MARGIN), W = cw + 2 * mx, H = ch + 2 * my;
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr), B = back;
  if (B.cv.width !== pw || B.cv.height !== ph) { B.cv.width = pw; B.cv.height = ph; }
  B.c2.setTransform(1, 0, 0, 1, 0, 0); B.c2.clearRect(0, 0, pw, ph);
  B.c2.setTransform(dpr, 0, 0, dpr, mx * dpr, my * dpr);
  B.c2.lineJoin = 'round'; B.c2.lineCap = 'round';
  // While the wheel eases toward a known zoom, the quick picture is drawn for where the camera is going,
  // so it still fits when it is finished a few hundred milliseconds later.
  let jc = { x: cam.x, y: cam.y, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch }, P = { ...pj() };
  if (q === 'live' && zoomTo) {
    zoomAt(zoomTo.at, zoomTo.dist / cam.dist);
    const tc = { x: cam.x, y: cam.y, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch }, tP = { ...pj() };
    Object.assign(cam, jc); jc = tc; P = tP;
  }
  job = { B, cam: jc, P, q, M: [mx, my],
    view: { x0: -mx, y0: -my, x1: cw + mx, y1: ch + my }, steps: null, i: 0, d: dpr, w: cw, h: ch };
}
/** Draws the next steps of the hidden picture for up to `ms` milliseconds; true when it is finished. */
function runJob(ms) {
  const J = job, t = performance.now(), save = { x: cam.x, y: cam.y, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch }, main = ctx, view = VIEW;
  Object.assign(cam, J.cam); PJ_OVR = J.P; ctx = J.B.c2; VIEW = J.view;
  try {
    if (!J.steps) { J.steps = []; setViewRadius(); cityDetailSteps(J.steps, J); planBuildings(J); }
    let u = 0;
    while (J.i < J.steps.length) {
      const w = J.steps[J.i].w || 1;
      if (u && u + w > 3) break;
      J.steps[J.i++](); u += w;
      if (performance.now() - t > ms) break;
    }
  } finally { Object.assign(cam, save); PJ_OVR = null; ctx = main; VIEW = view; }
  if (J.i < J.steps.length) return false;
  feather(J);
  // finished: the new picture goes on show and fades in over the last one, which is kept until then
  const spare = prev; prev = front; front = J.B; back = spare;
  Object.assign(old, cache, { t: performance.now() });
  Object.assign(cache, { P: J.P, M: J.M, q: J.q, ok: true, d: J.d, w: J.w, h: J.h });
  job = null;
  return true;
}
/** The spare margin around a picture fades out toward its outer edge (only seen while zooming out). */
function feather(J) {
  const c = J.B.c2, [mx, my] = J.M, w = J.w, h = J.h;
  const g = (x0, y0, x1, y1) => { const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
  c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1;
  c.fillStyle = g(-mx, 0, 0, 0); c.fillRect(-mx, -my, mx, h + 2 * my);
  c.fillStyle = g(w + mx, 0, w, 0); c.fillRect(w, -my, mx, h + 2 * my);
  c.fillStyle = g(0, -my, 0, 0); c.fillRect(0, -my, w, my);
  c.fillStyle = g(0, h + my, 0, h); c.fillRect(0, h, w, my);
  c.restore();
}
const picOk = (C) => C.ok && C.d === dpr && C.w === cw && C.h === ch;
function blitPic(cv, C, a) {
  const [mx, my] = C.M;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  ctx.drawImage(cv, -mx, -my, C.w + 2 * mx, C.h + 2 * my);
  ctx.globalAlpha = 1;
}
/** The current city picture, plus the last one while it fades out. */
function drawPics(now) {
  const k = old.t ? clamp01((now - old.t) / FADE) : 1;
  if (k < 1 && picOk(old)) { const a = cityFade * Math.min(1, 2 * (1 - k)); if (sameCam(old.P)) blitPic(prev.cv, old, a); else warpPic(prev.cv, old, a); }
  else old.t = 0;
  if (!picOk(cache)) return false;
  if (sameCam(cache.P)) blitPic(front.cv, cache, cityFade * k); else warpPic(front.cv, cache, cityFade * k);
  return k < 1;
}
/** Ground point → screen, through a saved camera (the one the cache was drawn with). */
function projP(P, x, y) {
  const dx = x - P.x, dy = y - P.y, xr = dx * P.c - dy * P.s, yr = dx * P.s + dy * P.c, depth = P.dist + yr * P.sp;
  if (depth < P.near) return null;
  const f = P.f / depth;
  return [P.cx + xr * f, P.cy - yr * P.cp * f];
}
const sameCam = (A) => A.x === cam.x && A.y === cam.y && A.dist === cam.dist && A.yaw === cam.yaw && A.pitch === cam.pitch && A.fv === freeVer;
/** Is the cached picture still close enough to lay onto the current view? */
function cacheFits() {
  const P0 = cache.P, P1 = pj(), zoom = P0.dist / P1.dist;
  if (zoom > 1.7 || zoom < 0.8 || Math.abs(P0.pitch - P1.pitch) > 0.2) return false;
  const [mx, my] = cache.M;
  for (const [sx, sy] of [[0, ch], [cw, ch], [cw / 2, ch * 0.6]]) {
    const g = unproj(sx, sy); if (!g) return false;
    const q = projP(P0, g[0], g[1]); if (!q) return false;
    if (q[0] < -mx - 40 || q[0] > cw + mx + 40 || q[1] < -my - 40 || q[1] > ch + my + 40) return false;
  }
  return true;
}
/** Lays a cached city picture onto the current view, band by band from the horizon down. */
function warpPic(cv, C, alpha) {
  const P1 = pj(), P0 = C.P, [mx, my] = C.M, W = C.w + 2 * mx, H = C.h + 2 * my;
  const zoom = P0.dist / P1.dist;
  // Stretched past 2x, a picture drawn from further out turns to blurred blocks: it fades out instead,
  // and the fresh picture fades in when it is ready (usually within a few frames).
  if (zoom > 2) alpha *= clamp01((3.2 - zoom) / 1.2);
  if (zoom > 6 || zoom < 0.2 || alpha <= 0.01) return;
  let top = 0;
  if (P1.sp > 0.02) top = Math.max(0, P1.cy - ((P1.cp - 0.04) / P1.sp) * P1.f);   // no ground above the horizon
  if (top >= ch - 1) return;
  // more, thinner bands when the picture is stretched far: each band is a flat (affine) stretch, and
  // the further from the camera it was drawn, the more its edges show as seams
  const K = Math.abs(Math.log(zoom)) > 0.3 ? 26 : 14;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
  let ya = Math.floor(top * dpr) / dpr;
  for (let k = 1; k <= K; k++) {
    const yb = k === K ? ch : Math.round((top + (ch - top) * Math.pow(k / K, 1.7)) * dpr) / dpr;
    if (yb <= ya) continue;
    const y0 = ya; ya = yb;
    const g0 = unproj(0, y0), g1 = unproj(cw, y0), g2 = unproj(0, yb);
    if (!g0 || !g1 || !g2) continue;
    const a = projP(P0, g0[0], g0[1]), b = projP(P0, g1[0], g1[1]), c = projP(P0, g2[0], g2[1]);
    if (!a || !b || !c) continue;
    // the affine map that takes cached points a, b, c to screen points (0, y0), (cw, y0), (0, yb)
    const du1 = b[0] - a[0], dv1 = b[1] - a[1], du2 = c[0] - a[0], dv2 = c[1] - a[1], D = du1 * dv2 - du2 * dv1;
    if (Math.abs(D) < 1e-9) continue;
    const A = (cw * dv2) / D, C = (-cw * du2) / D, B = (-(yb - y0) * dv1) / D, Dd = ((yb - y0) * du1) / D;
    const E = -A * a[0] - C * a[1], F = y0 - B * a[0] - Dd * a[1];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, cw, yb - y0); ctx.clip();
    ctx.setTransform(dpr * A, dpr * B, dpr * C, dpr * Dd, dpr * E, dpr * F);
    ctx.drawImage(cv, -mx, -my, W, H);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
// Buildings: extruded blocks, far to near, lit from one side; towers glow at the roof line.
// A building smaller than a pixel is skipped, small ones are flat roofs drawn in batches per colour,
// and only the nearest ones (FULL_BUDGET) get lit walls. Each batch is one step of the hidden picture.
const LIGHT = [Math.cos(0.9), Math.sin(0.9)];
const EDGE = ['#19e3d0', '#ff2e7e', '#ffb547'];
// Wall shades: the light falling on a wall, in eight steps from its dark side to its lit side. Roofs
// catch the most light (sky glow), so a block reads as a solid: bright top, a lit side, a dark side.
const SHADE = Array.from({ length: 8 }, (_, i) => { const lit = i / 7; return `rgb(${Math.round(20 + 74 * lit)},${Math.round(13 + 47 * lit)},${Math.round(36 + 86 * lit)})`; });
const ROOF = '#6a5288', ROOF_SMALL = '#4b3b66', BASE_SMALL = '#0d0816', SHADOW = 'rgba(4,0,12,0.5)';
// Shadows fall away from the light, half as long as the block is tall (in the drawn, exaggerated height).
const SH = [-LIGHT[0] * 0.5, -LIGHT[1] * 0.5];
// Window rows: a faint lit line along each floor of a tall wall, warm or cool by the block's class.
const WIN = ['rgba(255,214,150,', 'rgba(140,240,255,', 'rgba(255,150,200,'];
const FULL_BUDGET = 2600, EX = 2.4;
let BX = new Float32Array(64), BY = new Float32Array(64), RX = new Float32Array(64), RY = new Float32Array(64);
function planBuildings(J) {
  if (!CITY || cam.dist > 60) return;
  const fade = clamp01((60 - cam.dist) / 25), live = J.q === 'live';
  if (fade < 0.02) return;
  const minR = live ? 1.3 : 0.6, big = [], small = [[], [], []], tiny = [[], [], []], S = J.steps, all = CITY.bld;
  // sort into tiers, a batch of buildings per step
  const sortN = live ? 15000 : 6000;
  for (let i0 = 0; i0 < all.length; i0 += sortN) S.push(() => {
    setViewRadius();
    const P = pj();
    for (let i = i0, i1 = Math.min(all.length, i0 + sortN); i < i1; i++) {
      const b = all[i], dx = b.cx - P.x, dy = b.cy - P.y;
      if (dx * dx + dy * dy > VR2) continue;
      const xr = dx * P.c - dy * P.s, yr = dx * P.s + dy * P.c, depth = P.dist + yr * P.sp;
      if (depth < P.near * 2) continue;
      const f = P.f / depth, x = P.cx + xr * f, y = P.cy - yr * P.cp * f, rp = b.r * f, hp = b.h * EX * f;
      if (x + rp < VIEW.x0 - 8 || x - rp > VIEW.x1 + 8 || y + rp < VIEW.y0 - 8 || y - rp - hp > VIEW.y1 + 8) continue;
      if (rp < minR && hp < minR * 3) continue;   // the quick picture made while moving leaves out the tiniest
      if (rp < 1.3 && hp < 3) tiny[b.cls].push(b);
      else if (rp < 2.2 && hp < 5) small[b.cls].push(b); else { b.dep = depth; big.push(b); }
    }
  });
  // then queue the drawing: tiny, small, and the nearest with walls, far to near
  S.push(() => {
    big.sort((a, b) => a.dep - b.dep);
    const lim = live ? 600 : FULL_BUDGET;
    if (big.length > lim) { for (let i = lim; i < big.length; i++) small[big[i].cls].push(big[i]); big.length = lim; }
    const chunks = (list, n, fn) => { for (let i = 0; i < list.length; i += n) { const part = list.slice(i, i + n); S.push(() => fn(part)); } };
    // tiny and far: a dot of the edge colour, one fill per batch (an outline would be wider than the roof).
    // line(..., true) already returns to the first corner; closePath() on a path this big is very slow in Chrome.
    for (let k = 0; k < 3; k++) chunks(tiny[k], 650, (part) => {
      ctx.globalCompositeOperation = 'source-over'; ctx.beginPath();
      for (const b of part) line(b.pts, b.h * EX, true);
      ctx.globalAlpha = fade * (k ? 0.75 : 0.42); ctx.fillStyle = EDGE[k]; ctx.fill(); ctx.globalAlpha = 1;
    });
    // small: a dark footprint on the ground under a lit roof, so even a small block stands up off the
    // street; one path for the footprints and one for the roofs per batch
    for (let k = 0; k < 3; k++) chunks(small[k], 320, (part) => {
      ctx.globalCompositeOperation = 'source-over'; ctx.lineJoin = 'miter'; ctx.beginPath();
      for (const b of part) line(b.pts, 0, true);
      ctx.globalAlpha = fade * 0.9; ctx.fillStyle = BASE_SMALL; ctx.fill();
      ctx.beginPath();
      for (const b of part) line(b.pts, b.h * EX, true);
      ctx.globalAlpha = fade; ctx.fillStyle = ROOF_SMALL; ctx.fill();
      ctx.globalAlpha = fade * (k ? 0.9 : 0.45); ctx.lineWidth = k ? 1.1 : 0.7; ctx.strokeStyle = EDGE[k]; ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineJoin = 'round';
    });
    // near: lit walls and a roof, far to near, in batches from the far end
    const per = 80;   // a bigger batch is more GPU work in one frame (measured: more dropped frames)
    for (let e = big.length; e > 0; e -= per) { const part = big.slice(Math.max(0, e - per), e); S.push(() => drawBlocks(part, fade, live)); }
  });
}
/** Ground shadows for a batch, one path: per block, the outline around its footprint and the same
 * footprint slid away from the light (a convex hull, so one simple shape each, cheap for the GPU). */
const HX = new Float64Array(256), HY = new Float64Array(256), HI = new Int32Array(256);
function drawShadows(list, fade) {
  const P = pj();
  ctx.beginPath();
  for (const b of list) {
    const n = Math.min(b.n, 120), Q = b.pts, H = b.h * EX, ox = SH[0] * H, oy = SH[1] * H;
    let m = 0;
    for (let i = 0; i < n; i++) { HX[m] = Q[2 * i]; HY[m++] = Q[2 * i + 1]; HX[m] = Q[2 * i] + ox; HY[m++] = Q[2 * i + 1] + oy; }
    // monotone chain hull over the 2n ground points
    const idx = Array.from({ length: m }, (_, i) => i).sort((p, q) => HX[p] - HX[q] || HY[p] - HY[q]);
    const cr = (o, p, q) => (HX[p] - HX[o]) * (HY[q] - HY[o]) - (HY[p] - HY[o]) * (HX[q] - HX[o]);
    let k = 0;
    for (const i of idx) { while (k >= 2 && cr(HI[k - 2], HI[k - 1], i) <= 0) k--; HI[k++] = i; }
    for (let j = idx.length - 2, t = k + 1; j >= 0; j--) { const i = idx[j]; while (k >= t && cr(HI[k - 2], HI[k - 1], i) <= 0) k--; HI[k++] = i; }
    let first = true;
    for (let j = 0; j < k - 1; j++) {
      const dx = HX[HI[j]] - P.x, dy = HY[HI[j]] - P.y, xr = dx * P.c - dy * P.s, yr = dx * P.s + dy * P.c, depth = P.dist + yr * P.sp;
      if (depth < P.near) { first = true; continue; }
      const f = P.f / depth, sx = P.cx + xr * f, sy = P.cy - yr * P.cp * f;
      if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
    }
  }
  ctx.globalAlpha = fade; ctx.fillStyle = SHADOW; ctx.fill(); ctx.globalAlpha = 1;
}
// a cheap, stable per-building number in [0, 1), so lit windows differ from block to block
const rnd = (b) => { const v = Math.sin(b.cx * 12.9898 + b.cy * 78.233) * 43758.5453; return v - Math.floor(v); };
// The quick picture made while moving leaves out shadows and windows (not seen in motion, and the
// costliest part for the GPU); the full picture at rest has them.
function drawBlocks(list, fade, quick = false) {
  const P = pj();
  if (!quick) drawShadows(list, fade);
  ctx.globalCompositeOperation = 'source-over'; ctx.lineJoin = 'miter';
  for (let bi = list.length - 1; bi >= 0; bi--) {
    const b = list[bi], n = b.n, Q = b.pts, H = b.h * EX;
    if (BX.length < n) { BX = new Float32Array(n * 2); BY = new Float32Array(n * 2); RX = new Float32Array(n * 2); RY = new Float32Array(n * 2); }
    let ok = true;
    for (let i = 0; i < n; i++) {
      const dx = Q[2 * i] - P.x, dy = Q[2 * i + 1] - P.y, xr = dx * P.c - dy * P.s, yr = dx * P.s + dy * P.c;
      const d0 = P.dist + yr * P.sp, d1 = d0 - H * P.cp;
      if (d0 < P.near || d1 < P.near) { ok = false; break; }
      const f0 = P.f / d0, f1 = P.f / d1, y2 = yr * P.cp;
      BX[i] = P.cx + xr * f0; BY[i] = P.cy - y2 * f0; RX[i] = P.cx + xr * f1; RY[i] = P.cy - (y2 + H * P.sp) * f1;
    }
    if (!ok) continue;
    ctx.globalAlpha = 0.96 * fade;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      if ((BX[j] - BX[i]) * (RY[i] - BY[i]) - (BY[j] - BY[i]) * (RX[i] - BX[i]) <= 0) continue;   // wall faces away
      const ex2 = Q[2 * j] - Q[2 * i], ey2 = Q[2 * j + 1] - Q[2 * i + 1], L = Math.hypot(ex2, ey2) || 1;
      const lit = (ey2 / L) * LIGHT[0] - (ex2 / L) * LIGHT[1];
      ctx.beginPath(); ctx.moveTo(BX[i], BY[i]); ctx.lineTo(BX[j], BY[j]); ctx.lineTo(RX[j], RY[j]); ctx.lineTo(RX[i], RY[i]); ctx.closePath();
      ctx.fillStyle = SHADE[Math.round((lit + 1) * 3.5)]; ctx.fill();
      // window rows on a wall that is tall and wide enough on screen: one dashed line per floor
      const wh = Math.min(Math.hypot(RX[i] - BX[i], RY[i] - BY[i]), Math.hypot(RX[j] - BX[j], RY[j] - BY[j]));
      if (!quick && wh > 18 && Math.hypot(BX[j] - BX[i], BY[j] - BY[i]) > 8) {
        const floors = Math.min(Math.round(b.h * 1000 / 3.6), Math.floor(wh / 5), 28);
        if (floors >= 3) {
          const r = rnd(b), on = 0.16 + 0.3 * r + 0.18 * Math.max(0, lit);
          ctx.beginPath();
          for (let k = 1; k < floors; k++) {
            const tt = k / floors;
            ctx.moveTo(BX[i] + (RX[i] - BX[i]) * tt, BY[i] + (RY[i] - BY[i]) * tt);
            ctx.lineTo(BX[j] + (RX[j] - BX[j]) * tt, BY[j] + (RY[j] - BY[j]) * tt);
          }
          ctx.lineWidth = 1;
          ctx.strokeStyle = WIN[b.cls] + (on * 0.8 * fade).toFixed(3) + ')'; ctx.stroke();
          ctx.globalAlpha = 0.96 * fade;
        }
      }
    }
    ctx.beginPath(); ctx.moveTo(RX[0], RY[0]); for (let i = 1; i < n; i++) ctx.lineTo(RX[i], RY[i]); ctx.closePath();
    ctx.globalAlpha = fade; ctx.fillStyle = ROOF; ctx.fill();
    ctx.globalAlpha = fade * (b.cls ? 0.95 : 0.45); ctx.lineWidth = b.cls ? 1.3 : 0.8; ctx.strokeStyle = EDGE[b.cls]; ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineJoin = 'round';
}
// Region names: drawn after the pins, with a dark outline, so beams never cover them. Each name is
// drawn once per size (glow, outline, gradient) into a small canvas and stamped every frame: a
// blurred glow on live text is one of the slowest things a 2D canvas can do.
const sprites = new Map();
function regionSprite(name, size) {
  const key = name + '|' + size + '|' + dpr;
  let sp = sprites.get(key); if (sp) return sp;
  const font = `400 ${size}px Anton, Impact, sans-serif`;
  ctx.font = font; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(name), tw = Math.ceil(m.width);
  const asc = Math.ceil(m.actualBoundingBoxAscent || size * 0.75), desc = Math.ceil(m.actualBoundingBoxDescent || 0);
  const pad = Math.ceil(size * 0.6) + 4, w = tw + pad * 2, hh = asc + desc + pad * 2;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(hh * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
  const bx = w / 2, by = pad + asc;
  c.shadowColor = 'rgba(255,46,126,0.8)'; c.shadowBlur = Math.max(6, size * 0.45);
  c.lineWidth = Math.max(3, size * 0.14); c.strokeStyle = 'rgba(11,10,12,0.92)'; c.strokeText(name, bx, by);
  c.shadowBlur = 0;
  const gr = c.createLinearGradient(bx - tw / 2, 0, bx + tw / 2, 0); gr.addColorStop(0, '#ff2e7e'); gr.addColorStop(1, '#ff8a1f');
  c.fillStyle = gr; c.fillText(name, bx, by);
  sp = { cv, w, h: hh, tw, th: asc + desc };
  if (sprites.size > 160) sprites.delete(sprites.keys().next().value);
  sprites.set(key, sp);
  return sp;
}
const snap = (v) => Math.round(v * dpr) / dpr;
function drawRegionLabels() {
  ctx.globalCompositeOperation = 'source-over';
  // Region names never overlap: a name that would land on one already drawn moves down, then up, a line at a time.
  const regBoxes = [];
  for (const r of MAP.regions) {
    const p = proj(...W(r.anchor), 2); if (!p || p[2] > cam.dist * 2.4) continue;
    const size = Math.round(Math.max(11, Math.min(34, 22 * focal() / p[2])));
    const sp = regionSprite(r.name.toUpperCase(), size), tw = sp.tw, bh = size * 1.05;
    const hit = (x, y) => regBoxes.some((b) => Math.abs(b[0] - x) < (b[2] + tw) / 2 + 4 && Math.abs(b[1] - y) < (b[3] + bh) / 2);
    let at = null;
    // Try the anchor, then a line down or up; a name partly under a panel slides into the open map.
    const xs = [p[0], Math.min(Math.max(p[0], free.l + tw / 2 + 8), free.r - tw / 2 - 8)];
    for (const x of xs) {
      if (Math.abs(x - p[0]) > tw * 0.6) continue;
      for (const dy of [0, bh, -bh, 2 * bh, -2 * bh]) if (!hit(x, p[1] + dy) && roomFor(x - tw / 2, p[1] + dy - sp.th / 2, tw, sp.th)) { at = [x, p[1] + dy]; break; }
      if (at) break;
    }
    if (!at) continue;
    regBoxes.push([at[0], at[1], tw, bh]);
    const dim = state.region && state.region !== r.id;
    ctx.globalAlpha = (dim ? 0.25 : 1) * Math.min(1, Math.max(0.35, (cam.dist - 60) / 260)); // fade only when zoomed in close
    ctx.drawImage(sp.cv, snap(at[0] - sp.w / 2), snap(at[1] - sp.h / 2), sp.w, sp.h);
  }
  ctx.globalAlpha = 1;
}
function render(t) {
  const t0 = performance.now(), live = t0 < busyUntil || !!anim || !!zoomTo || !!drag;
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
  drawCityBase();
  if (cityDetailOn()) {
    pj();
    const valid = picOk(cache), exact = valid && sameCam(cache.P);
    if (drawPics(t0)) dirty = true;
    // At rest: a full-detail picture for this exact view. Moving: a quick one, only when the last no longer fits.
    if (!live) { if (!(exact && cache.q === 'full') && !(job && job.q === 'full' && job.d === dpr && sameCam(job.P))) startJob('full'); }
    else if (!job && !(valid && cacheFits())) startJob('live');
  } else job = null;

  // pins, far to near
  hitList = [];
  const pulse = selected && !RM ? (Math.sin((t || 0) / 260) + 1) / 2 : 0;
  const beam = cam.dist * 0.075;
  const items = [];
  for (const p of placed) {
    if (!visible(p)) continue;
    const base = proj(p.w[0], p.w[1], 0), top = proj(p.w[0], p.w[1], beam);
    if (!base || !top) continue;
    if (Math.max(base[0], top[0]) < -30 || Math.min(base[0], top[0]) > cw + 30 || Math.max(base[1], top[1]) < -30 || Math.min(base[1], top[1]) > ch + 30) continue;
    items.push({ p, base, top });
  }
  items.sort((a, b) => b.base[2] - a.base[2]);
  ctx.globalCompositeOperation = 'lighter';
  for (const { p, base, top } of items) hitList.push({ p, x: top[0], y: top[1], bx: base[0], by: base[1] });
  // Pins are drawn in batches: one path per colour and haze step for rings, beams, heads and halos.
  // Light is added ('lighter'), and a sum is the same in any order, so batching changes nothing on
  // screen; it turns about six drawing calls per pin into six per batch.
  const batches = new Map(), solo = [];
  for (const it of items) {
    if (it.p === selected || it.p === hover) { solo.push(it); continue; }
    // far pins (towards the horizon when tilted) shrink and fade, so they do not pile into a glare
    const fog = Math.round(4 * Math.min(1, Math.max(0.25, 1.6 - it.base[2] / (cam.dist * 2.6)))) / 4;
    it.pk = Math.min(1, Math.max(0.45, cam.dist * 1.15 / it.base[2]));
    const key = it.p.cat + fog;
    let B = batches.get(key); if (!B) batches.set(key, B = { cat: it.p.cat, col: CATS[it.p.cat].color, fog, list: [] });
    B.list.push(it);
  }
  // Beams and heads are stamped from small pre-drawn pictures (one per colour): a GPU canvas copies
  // pictures very cheaply, while a path with hundreds of glowing shapes can cost a frame on its own.
  const PS = pinSprites();
  for (const { cat, col, fog, list } of batches.values()) {
    // certainty ring on the ground: wide and dashed when only the region is known. Faint, so it is left
    // out while the map moves and comes back when it stops.
    if (cam.dist < 500 && !live) {
      for (const dashed of [false, true]) {
        ctx.beginPath(); let any = false;
        for (const { p, base } of list) if ((p.precision === 'region') === dashed && ringFits(p, base) && pinRing(p)) any = true;
        if (any) { ctx.setLineDash(dashed ? [4, 5] : []); ctx.strokeStyle = col; ctx.globalAlpha = 0.22 * fog; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      ctx.setLineDash([]);
    }
    const S = PS[cat], bw = 12 * Math.max(0.45, fog);
    // beam: the glow strip stretched from the ground to the head. Laid over, not added: a dense cluster
    // (a hundred pins in Vice City seen from the whole state) then stays coloured instead of burning white.
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fog;
    for (const { base, top } of list) {
      const vx = top[0] - base[0], vy = top[1] - base[1], len = Math.hypot(vx, vy) || 1, ux = vx / len, uy = vy / len, nx = -uy * bw / 16, ny = ux * bw / 16;
      ctx.setTransform(dpr * nx, dpr * ny, dpr * ux * len / 4, dpr * uy * len / 4, dpr * (base[0] - nx * 8), dpr * (base[1] - ny * 8));
      ctx.drawImage(S.beam, 0, 0, 16, 4);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // head with its halo
    ctx.globalAlpha = 0.4 + 0.6 * fog;
    for (const { top, pk: k } of list) { const z = 4.5 * k * zoomK / 8; ctx.drawImage(S.head, top[0] - 20 * z, top[1] - 20 * z, 40 * z, 40 * z); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
  }
  // the selected and hovered pins, full size and bright, on top
  for (const { p, base, top } of solo) {
    const col = CATS[p.cat].color, isSel = selected === p;
    ctx.beginPath();
    if (pinRing(p)) { ctx.setLineDash(p.precision === 'region' ? [4, 5] : []); ctx.strokeStyle = col; ctx.globalAlpha = isSel ? 0.6 : 0.3; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]);
    glow(col, isSel ? [[10, 0.12], [5, 0.3], [2, 1]] : [[6, 0.1], [3, 0.22], [1.3, 0.9]]);
    const r = (isSel ? 7 + pulse * 3 : 7) * zoomK;
    ctx.beginPath(); ctx.moveTo(top[0], top[1] - r); ctx.lineTo(top[0] + r, top[1]); ctx.lineTo(top[0], top[1] + r); ctx.lineTo(top[0] - r, top[1]); ctx.closePath();
    ctx.fillStyle = col; ctx.globalAlpha = 0.95; ctx.fill();
    ctx.beginPath(); ctx.arc(top[0], top[1], r * 2.2, 0, Math.PI * 2); ctx.globalAlpha = isSel ? 0.22 : 0.08; ctx.fill(); ctx.globalAlpha = 1;
  }

  // area labels when zoomed in, drawn over the pins so a glow never washes a name out
  // place names fade in by size: towns first, then keys, parks and water, then districts and islands
  const SHOW = { county: 520, town: 380, key: 140, park: 160, lake: 200, island: 60, district: 45 };
  ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 11px "DM Sans", system-ui, sans-serif';
  const spaced = 'letterSpacing' in ctx; if (spaced) ctx.letterSpacing = '1px';
  const placedNames = []; nameBoxes = [];
  for (const a of AREAS_BY_RANK) {
    const lim = SHOW[a.kind] || 380; if (cam.dist > lim) continue;
    const p = proj(...(a.w || (a.w = W(a.pos))), 0.05); if (!p || p[2] > cam.dist * 2.2 || p[0] < 0 || p[0] > cw || p[1] < 0 || p[1] > ch) continue;
    const tw = ctx.measureText(a.name.toUpperCase()).width + 8;
    if (!roomFor(p[0] - tw / 2, p[1] - 9, tw, 18)) continue;
    if (placedNames.some((b) => Math.abs(b[0] - p[0]) < (b[2] + tw) / 2 && Math.abs(b[1] - p[1]) < 15)) continue;
    placedNames.push([p[0], p[1], tw]); nameBoxes.push([p[0] - tw / 2, p[1] - 8, tw, 16]);
    ctx.globalAlpha = Math.min(0.85, (lim - cam.dist) / (lim * 0.4));
    ctx.fillStyle = a.kind === 'lake' ? '#7ab8ff' : a.kind === 'park' ? '#4dff88' : '#fff3e4';
    ctx.strokeStyle = 'rgba(11,10,12,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText(a.name.toUpperCase(), p[0], p[1]); ctx.fillText(a.name.toUpperCase(), p[0], p[1]);
  }
  if (spaced) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;

  ctx.globalCompositeOperation = 'source-over';
  drawRegionLabels();
  ctx.textAlign = 'left';
  // name tags for the selected pin and, when close, for every pin. Each tag is measured from the font,
  // sits beside its pin (right, or left when the right is covered), and never goes under a panel.
  ctx.font = '700 12px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (!TAGM) { const m = ctx.measureText('H\u00d1gjpy()'); TAGM = { asc: Math.ceil(m.actualBoundingBoxAscent || 10), desc: Math.ceil(m.actualBoundingBoxDescent || 3) }; }
  const near = cam.dist < 130 ? [...hitList].filter((it) => { const q = proj(it.p.w[0], it.p.w[1]); return q && q[2] < cam.dist * 2.2; }).sort((a, b) => (a.x - CX()) ** 2 + (a.y - CY()) ** 2 - (b.x - CX()) ** 2 - (b.y - CY()) ** 2).slice(0, 10) : [];
  const over = (x, y, w, hh) => (r) => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + hh > r[1];
  const taken = [], free4 = (x, y, w, hh) => !taken.some(over(x, y, w, hh)) && !nameBoxes.some(over(x, y, w, hh));
  const tags = [...hitList.filter((it) => it.p === selected), ...near.filter((it) => it.p !== selected)].slice(0, cw < 600 ? 6 : 10);
  const th = TAGM.asc + TAGM.desc + 9;
  for (const it of tags) {
    const isSel = it.p === selected;
    const label = it.p.name.length > 34 ? it.p.name.slice(0, 32) + '\u2026' : it.p.name, w = Math.ceil(ctx.measureText(label).width) + 17;
    const y = Math.round(it.y - th / 2);
    let x = null;
    for (const cx of [Math.round(it.x + 12), Math.round(it.x - 12 - w)]) if (roomFor(cx, y, w, th) && (isSel || free4(cx, y, w, th))) { x = cx; break; }
    if (x === null) continue;
    taken.push([x, y, w, th]);
    ctx.fillStyle = 'rgba(11,10,12,0.9)'; ctx.fillRect(x, y, w, th);
    ctx.fillStyle = CATS[it.p.cat].color; ctx.fillRect(x, y, 3, th);
    ctx.fillStyle = isSel ? '#ffd23f' : '#fff3e4'; ctx.fillText(label, x + 10, y + 5 + TAGM.asc);
  }
  el('needle').style.transform = `rotate(${-cam.yaw}rad)`;
}
let TAGM = null, nameBoxes = [];

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
  moved = 0; anim = null; zoomTo = null;
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
    Object.assign(drag, now); moved += 10; busy(); draw(); return;
  }
  const [lx, ly] = drag.last;
  moved += Math.abs(pt[0] - lx) + Math.abs(pt[1] - ly);
  if (drag.mode === 'turn') {
    cam.yaw += (pt[0] - lx) * 0.006;
    cam.pitch = Math.min(1.12, Math.max(0, cam.pitch + (pt[1] - ly) * 0.004));
    el('tilt').setAttribute('aria-pressed', String(cam.pitch > 0.3));
  } else panBy([lx, ly], pt);
  drag.last = pt; busy(); draw();
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
// A trackpad pinch arrives as a wheel event with ctrlKey and small steps, so it gets a stronger rate.
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const rate = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : e.ctrlKey ? 0.012 : 0.0016; zoomBy(Math.exp(Math.max(-1, Math.min(1, e.deltaY * rate))), local(e)); }, { passive: false });
canvas.addEventListener('dblclick', (e) => { const pt = local(e), g = unproj(...pt); if (g) fly({ x: g[0], y: g[1], dist: Math.max(MIN_D, cam.dist * 0.45) }); });
canvas.addEventListener('keydown', (e) => {
  const step = cam.dist * 0.08, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const move = (dx, dy) => { cam.x += dx * c + dy * s; cam.y += -dx * s + dy * c; clampCam(); };
  const k = e.key;
  if (k === 'ArrowLeft') move(-step, 0); else if (k === 'ArrowRight') move(step, 0);
  else if (k === 'ArrowUp') move(0, step); else if (k === 'ArrowDown') move(0, -step);
  else if (k === '+' || k === '=') { e.preventDefault(); zoomBy(0.8); return; }
  else if (k === '-' || k === '_') { e.preventDefault(); zoomBy(1.25); return; }
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
el('zin').addEventListener('click', () => zoomBy(0.6));
el('zout').addEventListener('click', () => zoomBy(1.6));
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
  el('card-warn').textContent = [p.statusNote ? 'Why ' + p.status + ': ' + p.statusNote : '', warn].filter(Boolean).join(' ');
  el('card-out').textContent = '';
  el('card-street').hidden = !p.w;
  card.hidden = false;
  history.replaceState(null, '', '#p=' + p.id);
  measureFree();
  if (p.w && !fromMap) {
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
// First view: downtown Vice City, tilted, close enough that the blocks stand up. A shared link to a
// spot starts from the whole state instead, so the flight shows where that spot is.
const VC = W([-80.192, 25.777]);
if (start) fitAll(placed, false); else Object.assign(cam, { x: VC[0], y: VC[1], dist: cw > 860 ? 9 : 7, yaw: -0.18, pitch: PITCH3D });
if (start) select(start);
addEventListener('hashchange', () => { const id = (location.hash.match(/^#p=([a-z0-9-]+)$/) || [])[1]; const p = id && places.find((x) => x.id === id); if (p && p !== selected) select(p); });
if (document.fonts?.ready) document.fonts.ready.then(() => { sprites.clear(); TAGM = null; draw(); });
setTimeout(loadCity, 60);
})();
