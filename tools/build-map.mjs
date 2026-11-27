#!/usr/bin/env node
// Builds the Leonida map data. No dependencies, Node 18+.
//
//   node tools/build-map.mjs          validate content/map/*.json and write dist/data/map.js
//   node tools/build-map.mjs --check  validate only, and fail if dist/data/map.js is out of date (used in CI)
//
// The map page reads window.LEONIDA_MAP from dist/data/map.js (a classic script, so it also works from file://).
// Everything here is hand-curated; the rules below are what keep it honest for years of small edits.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, safeUrl, STATUSES } from './lib/intel.mjs';

export const SCHEMA = 2;
export const CATS = ['weapon', 'vehicle', 'secret', 'money', 'mission', 'landmark', 'service'];
export const PRECISION = ['spot', 'mapped', 'near', 'area', 'region'];
export const AREA_KINDS = ['county', 'town', 'district', 'island', 'key', 'park', 'lake'];
// Box around Leonida in Open GTA 6 Map units (0-1024, y grows south). A pin outside it is a typo,
// or a longitude/latitude pair left over from the old stand-in map.
const BOX = { x0: 150, x1: 850, y0: 150, y1: 850 };
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validate(data, world) {
  const errs = [];
  const e = (where, msg) => errs.push(`${where}: ${msg}`);
  if (data.schema !== SCHEMA) e('places.json', `schema must be ${SCHEMA} (found ${data.schema}); bump SCHEMA in tools/build-map.mjs and the page together`);
  const regionIds = new Set();
  for (const r of data.regions || []) {
    if (!ID.test(r.id || '')) e(`region ${r.id}`, 'id must be lower-case-with-dashes');
    if (regionIds.has(r.id)) e(`region ${r.id}`, 'duplicate id');
    regionIds.add(r.id);
    if (!inBox(r.anchor)) e(`region ${r.id}`, 'anchor must be [x, y] inside the map');
  }
  const ids = new Set();
  for (const [i, p] of (data.places || []).entries()) {
    const w = `place ${p.id || '#' + i}`;
    if (!ID.test(p.id || '')) e(w, 'id must be lower-case-with-dashes');
    if (ids.has(p.id)) e(w, 'duplicate id');
    ids.add(p.id);
    if (!p.name) e(w, 'name missing');
    if (!CATS.includes(p.cat)) e(w, `cat must be one of ${CATS.join(', ')}`);
    if (!STATUSES.includes(p.status)) e(w, `status must be one of ${STATUSES.join(', ')}`);
    if (!PRECISION.includes(p.precision)) e(w, `precision must be one of ${PRECISION.join(', ')}`);
    if (p.region !== null && !regionIds.has(p.region)) e(w, `region must be one of ${[...regionIds].join(', ')} or null`);
    if (p.pos !== null && !inBox(p.pos)) e(w, 'pos must be [x, y] inside the map (Open GTA 6 Map units), or null if no source says where');
    if (p.pos === null && p.precision !== 'region') e(w, "a place with no pin has precision 'region'");
    if ((p.precision === 'mapped' || p.precision === 'near') && !(p.mapRef && p.mapRef.id && p.mapRef.name)) e(w, `precision '${p.precision}' needs mapRef { id, name }: the community map record the pin was taken from`);
    if (p.more != null && (!Array.isArray(p.more) || p.more.some((m) => !inBox(m.pos) || !m.label))) e(w, 'more must be a list of { pos: [x, y], label }');
    if (p.precision === 'spot' && !(p.status === 'Tested' || p.status === 'Official')) e(w, "precision 'spot' is only for places we stood on ourselves (Tested) or Rockstar placed (Official)");
    if (!p.summary) e(w, 'summary missing');
    if (p.statusNote != null && (typeof p.statusNote !== 'string' || !p.statusNote.trim())) e(w, 'statusNote must be a sentence saying why the label is what it is');
    if (!Array.isArray(p.sources) || !p.sources.length) e(w, 'needs at least one source');
    for (const s of p.sources || []) {
      if (!s.publisher) e(w, 'every source needs a publisher');
      if (!safeUrl(s.url)) e(w, `source url must be http(s): ${s.url}`);
      if (s.read && !/^\d{4}-\d{2}-\d{2}$/.test(s.read)) e(w, 'source read date must be YYYY-MM-DD');
    }
    if (p.status === 'Official' && !(p.sources || []).some((s) => /(^|\.)rockstargames\.com$/.test(host(s.url)))) e(w, 'Official needs a rockstargames.com source');
    if (p.status === 'Tested' && !(p.checked?.on && p.checked?.version && p.checked?.platform)) e(w, 'Tested needs checked.on, checked.version and checked.platform');
  }
  for (const a of data.areas || []) {
    if (!a.name) e('area', 'name missing');
    if (!inBox(a.pos)) e(`area ${a.name}`, 'pos must be [x, y] inside the map');
    if (a.kind && !AREA_KINDS.includes(a.kind)) e(`area ${a.name}`, `kind must be one of ${AREA_KINDS.join(', ')}`);
  }
  if (!world?.land?.length || !world?.coarse?.length) e('leonida.json', 'land shapes missing; run tools/map/import-leonida.py');
  return errs;
}
const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const inBox = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= BOX.x0 && p[0] <= BOX.x1 && p[1] >= BOX.y0 && p[1] <= BOX.y1;

/** The page payload: text cleaned and capped, so a slip in the JSON can never inject markup. */
export function build(data, world) {
  const t = (s, n) => clean(s || '', n);
  return {
    schema: SCHEMA,
    updated: data.updated || '',
    // the light outline for the first paint; the full map (data/leonida.js) loads after it
    world: { source: world.source, changes: world.changes, q: world.q, bbox: world.bbox, coarse: world.coarse },
    regions: data.regions.map((r) => ({ id: r.id, name: t(r.name, 40), anchor: r.anchor, blurb: t(r.blurb, 200) })),
    areas: (data.areas || []).map((a) => ({ name: t(a.name, 40), pos: a.pos, kind: AREA_KINDS.includes(a.kind) ? a.kind : 'town' })),
    places: data.places.map((p) => {
      const o = {
        id: p.id, name: t(p.name, 80), region: p.region, area: t(p.area, 80), cat: p.cat, pos: p.pos, precision: p.precision, status: p.status,
        summary: t(p.summary, 400), how: (p.how || []).map((x) => t(x, 300)), reward: t(p.reward, 160), needs: t(p.needs, 200),
        sources: p.sources.map((s) => ({ publisher: t(s.publisher, 60), url: safeUrl(s.url), read: s.read || '' })),
      };
      if (p.mapRef) o.mapRef = { id: t(p.mapRef.id, 40), name: t(p.mapRef.name, 80) };
      if (p.more) o.more = p.more.map((m) => ({ pos: m.pos, label: t(m.label, 60) }));
      if (p.statusNote) o.statusNote = t(p.statusNote, 200);
      if (p.checked) o.checked = { on: t(p.checked.on, 12), version: t(p.checked.version, 20), platform: t(p.checked.platform, 40), clip: safeUrl(p.checked.clip) };
      return o;
    }),
  };
}

// Run as a command only when called directly (tests import validate/build without side effects).
if (/build-map\.mjs$/.test(process.argv[1] || '')) {
  const root = process.env.LEONIDA_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
  const data = JSON.parse(readFileSync(join(root, 'content/map/places.json'), 'utf8'));
  const world = JSON.parse(readFileSync(join(root, 'content/map/leonida.json'), 'utf8'));
  const errs = validate(data, world);
  for (const x of errs) console.log('ERROR ' + x);
  if (errs.length) { console.log(`${errs.length} problem(s); nothing written`); process.exit(1); }
  const out = join(root, 'dist/data/map.js');
  const text = `/* written by tools/build-map.mjs from content/map/; do not edit by hand */\nwindow.LEONIDA_MAP = ${JSON.stringify(build(data, world))};\n`;
  const placed = data.places.filter((p) => p.pos).length;
  // The full map (land, water, roads, buildings) is copied without the first-paint outline; it is only numbers.
  const { coarse, ...full } = world;
  const cityOut = join(root, 'dist/data/leonida.js');
  const cityText = `/* written by tools/build-map.mjs from content/map/leonida.json. ${world.source}. ${world.changes} */\nwindow.LEONIDA_WORLD = ${JSON.stringify(full)};\n`;
  if (process.argv.includes('--check')) {
    const cur = existsSync(out) ? readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== text) { console.log('ERROR dist/data/map.js is out of date: run node tools/build-map.mjs and commit it'); process.exit(1); }
    if (!existsSync(cityOut) || readFileSync(cityOut, 'utf8').replace(/\r\n/g, '\n') !== cityText) { console.log('ERROR dist/data/leonida.js is out of date: run node tools/build-map.mjs and commit it'); process.exit(1); }
    console.log(`map OK: ${data.places.length} places (${placed} placed)`);
  } else {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
    writeFileSync(cityOut, cityText);
    console.log(`wrote dist/data/map.js: ${data.places.length} places (${placed} placed) and dist/data/leonida.js: ${world.land.length} land shapes, ${world.bld.length + world.blk.length} buildings`);
  }
}
