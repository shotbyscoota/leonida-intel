// Tests for the Leonida map data rules. No network.
//   node --test tools/test-map.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, build, borderSegments, SCHEMA, CATS } from './build-map.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const real = JSON.parse(readFileSync(join(root, 'content/map/places.json'), 'utf8'));
const outline = JSON.parse(readFileSync(join(root, 'content/map/outline.json'), 'utf8'));
const base = () => JSON.parse(JSON.stringify(real));
const one = (patch) => { const d = base(); d.places = [{ ...d.places[0], ...patch }]; return validate(d, outline); };

test('the committed map data passes every rule', () => {
  assert.deepEqual(validate(real, outline), []);
  assert.equal(real.schema, SCHEMA);
  assert.ok(real.places.length >= 40, 'about 40 places at launch');
  assert.ok(real.places.every((p) => p.sources.length >= 1));
});

test('the outline is the trimmed stand-in, with the keys and Lake Leonida', () => {
  assert.ok(outline.land.length > 10, 'keys present as separate rings');
  assert.ok(outline.land.every((r) => r.every(([lon]) => lon >= outline.westCrop)));
  assert.equal(outline.lakes[0].name, 'Lake Leonida');
  assert.match(outline.source, /Natural Earth/);
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

test('positions stay on the map, and unknown places stay off it', () => {
  assert.match(one({ pos: [-70, 25] }).join(), /inside the map/);
  assert.match(one({ pos: [25.7, -80.2] }).join(), /inside the map/, 'swapped lat/lon is caught');
  assert.deepEqual(one({ pos: null }), []);
});

test('ids, regions and categories are checked', () => {
  const d = base(); d.places.push({ ...d.places[0] });
  assert.match(validate(d, outline).join(), /duplicate id/);
  assert.match(one({ id: 'Bad Id' }).join(), /lower-case/);
  assert.match(one({ region: 'liberty-city' }).join(), /region must be/);
  assert.match(one({ cat: 'gun' }).join(), new RegExp(`cat must be one of ${CATS[0]}`));
});

test('the page payload is plain text only', () => {
  const d = base();
  d.places[0] = { ...d.places[0], name: '<img src=x onerror=alert(1)>Tank', summary: 'Hi <b>there</b>' };
  const out = build(d, outline);
  assert.equal(out.places[0].name, 'Tank');
  assert.equal(out.places[0].summary, 'Hi there');
  assert.doesNotMatch(JSON.stringify(out), /<img|onerror|<b>/);
});

test('only land borders are drawn as borders; every shore segment stays coastline', () => {
  const b = borderSegments(outline), r = outline.land[0], W = outline.westCrop;
  const segs = new Set(b[0]);
  const cut = r.findIndex((p, i) => p[0] === W && r[(i + 1) % r.length][0] === W);
  assert.ok(segs.has(cut), 'the trimmed west edge is a border');
  for (const i of segs) {
    const a = r[i], c = r[(i + 1) % r.length];
    assert.ok(a[0] < -81.7 && c[0] < -81.7, 'no Atlantic shore segment is marked as border');
  }
  assert.ok(segs.size < r.length * 0.1, 'borders are a small part of the ring');
  for (const [ri, list] of Object.entries(b)) if (ri !== '0') assert.fail('islands have no land borders: ring ' + ri + ' ' + list);
  assert.ok(build(real, outline).outline.border, 'the page payload carries the border list');
});
