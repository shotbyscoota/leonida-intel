// Tests for the Leonida map data rules. No network.
//   node --test tools/test-map.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, build, SCHEMA, CATS } from './build-map.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const real = JSON.parse(readFileSync(join(root, 'content/map/places.json'), 'utf8'));
const world = JSON.parse(readFileSync(join(root, 'content/map/leonida.json'), 'utf8'));
const base = () => JSON.parse(JSON.stringify(real));
const one = (patch) => { const d = base(); d.places = [{ ...d.places[0], ...patch }]; return validate(d, world); };

test('the committed map data passes every rule', () => {
  assert.deepEqual(validate(real, world), []);
  assert.equal(real.schema, SCHEMA);
  assert.ok(real.places.length >= 40, 'about 40 places at launch');
  assert.ok(real.places.every((p) => p.sources.length >= 1));
});

test('the map geometry is Leonida from the Open GTA 6 Map data, credited, with the islands', () => {
  assert.ok(world.land.length > 100, 'the keys and islands are separate shapes');
  assert.ok(world.coarse.length > 10 && world.coarse.length < world.land.length, 'a lighter first-paint outline');
  assert.match(world.source, /Open GTA 6 Map.*CC BY 4\.0.*commit [0-9a-f]{40}/, 'source, licence and the exact commit');
  assert.match(world.changes, /heights/i, 'says what we changed (CC BY)');
  const [x0, y0, x1, y1] = world.bbox;
  assert.ok(x0 > 150 && y0 > 150 && x1 < 850 && y1 < 850, 'inside the map box the pins use');
  assert.ok(world.bld.length > 1000 && world.blk.length > 1000 && world.roads.highway.length > 100);
});

test('a place without a source, or with a bad link, is refused', () => {
  assert.match(one({ sources: [] }).join(), /needs at least one source/);
  assert.match(one({ sources: [{ publisher: 'X', url: 'javascript:alert(1)' }] }).join(), /source url/);
});

test('labels keep their meaning', () => {
  assert.match(one({ status: 'Tested' }).join(), /Tested needs checked/);
  assert.deepEqual(one({ status: 'Tested', checked: { on: '2026-11-30', version: '1.002.002', platform: 'PS5' } }), []);
  assert.match(one({ status: 'Official' }).join(), /rockstargames\.com/);
  assert.match(one({ status: 'Confirmed' }).join(), /status must be/);
  assert.match(one({ precision: 'spot' }).join(), /only for places we stood on/);
});

test('an exact pin names the community map record it came from', () => {
  const m = real.places.find((p) => p.precision === 'mapped');
  assert.ok(m && m.mapRef.id && m.mapRef.name);
  const d = base(); d.places = [{ ...m, mapRef: undefined }];
  assert.match(validate(d, world).join(), /needs mapRef/);
  d.places = [{ ...m, precision: 'near', mapRef: { id: 'L1' } }];
  assert.match(validate(d, world).join(), /needs mapRef/);
  d.places = [{ ...m, more: [{ pos: [-80.1, 25.7], label: 'part 2' }] }];
  assert.match(validate(d, world).join(), /more must be/);
  assert.equal(build(base(), world).places.find((p) => p.id === m.id).mapRef.name, m.mapRef.name);
});

test('the five cars the desk tested are Tested on both consoles, on their exact spots', () => {
  for (const id of ['vapid-stainer-55', 'wyman-transgressor', 'dominator-buggy-ue', 'wyman-riata', 'grotti-cheetah-95']) {
    const p = real.places.find((x) => x.id === id);
    assert.equal(p.status, 'Tested', id);
    assert.deepEqual(p.checked, { on: '2026-11-27', version: '1.002.002', platform: 'PS5 + Xbox Series X|S' });
    assert.equal(p.precision, 'mapped', id);
  }
  assert.equal(real.places.find((x) => x.id === 'wyman-riata').more.length, 2, 'all three Riata wrecks');
});

test('positions stay on the map, and unknown places stay off it', () => {
  assert.match(one({ pos: [-80.2, 25.7] }).join(), /inside the map/, 'an old longitude/latitude pair is caught');
  assert.match(one({ pos: [900, 400] }).join(), /inside the map/);
  assert.match(one({ pos: null, precision: 'area' }).join(), /no pin has precision 'region'/);
  assert.deepEqual(one({ pos: null, precision: 'region', mapRef: undefined, more: undefined }), []);
});

test('ids, regions and categories are checked', () => {
  const d = base(); d.places.push({ ...d.places[0] });
  assert.match(validate(d, world).join(), /duplicate id/);
  assert.match(one({ id: 'Bad Id' }).join(), /lower-case/);
  assert.match(one({ region: 'liberty-city' }).join(), /region must be/);
  assert.match(one({ cat: 'gun' }).join(), new RegExp(`cat must be one of ${CATS[0]}`));
});

test('the page payload is plain text only', () => {
  const d = base();
  d.places[0] = { ...d.places[0], name: '<img src=x onerror=alert(1)>Tank', summary: 'Hi <b>there</b>' };
  const out = build(d, world);
  assert.equal(out.places[0].name, 'Tank');
  assert.equal(out.places[0].summary, 'Hi there');
  assert.doesNotMatch(JSON.stringify(out), /<img|onerror|<b>/);
});

test('the intel board examples point at spots that exist', () => {
  const site = readFileSync(join(root, 'dist/site.js'), 'utf8');
  const block = site.match(/const FEATURED = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'FEATURED list found in dist/site.js');
  const ids = [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  const have = new Set(real.places.map((p) => p.id));
  for (const id of ids) assert.ok(have.has(id), `featured spot ${id} is missing from places.json`);
});

test('a label note explains a label, and is plain text', () => {
  const d = base(); d.places[0] = { ...d.places[0], statusNote: '' };
  assert.match(validate(d, world).join(), /statusNote/);
  d.places[0].statusNote = 'Dexerto confirms it; <b>only</b> fan guides say where.';
  assert.equal(build(d, world).places[0].statusNote, 'Dexerto confirms it; only fan guides say where.');
});
