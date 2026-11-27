/* Leonida Intel · Every spot: the map's places as a filterable list.
   Data: window.LEONIDA_MAP (data/map.js), the same file the map uses, so the two never disagree.
   Every string from the data is set with textContent, never parsed as HTML. */
(() => {
'use strict';
const MAP = window.LEONIDA_MAP;
const FEED = window.LEONIDA_FEED || {};
const el = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'style') n.style.cssText = v; else n.setAttribute(k, v); } n.append(...kids.filter((x) => x != null && x !== false)); return n; };
const safe = (u) => /^https?:\/\//.test(u || '') ? u : null;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!MAP || !MAP.places) { el('count').textContent = 'The list did not load. Try reloading the page.'; return; }

// Same colours and names as the map. Order: what people come for first.
const CATS = {
  vehicle: { label: 'Vehicles', one: 'Vehicle', color: '#19e3d0', blurb: 'Free, hidden and rare rides: supercars, tanks, jets, helicopters, boats and bikes, and how to keep them.' },
  weapon: { label: 'Weapons', one: 'Weapon', color: '#ff2e7e', blurb: 'Unique and free guns, where they lie, and what it takes to get them.' },
  money: { label: 'Money', one: 'Money', color: '#4dff88', blurb: 'Robberies with their safe codes, stashes, collectibles you can sell, and money tricks.' },
  secret: { label: 'Secrets', one: 'Secret', color: '#ffd23f', blurb: 'Easter eggs, mysteries, hidden areas and nods to older games.' },
  mission: { label: 'Missions', one: 'Mission', color: '#ff8a1f', blurb: 'Side jobs and strangers that start at a place on the map.' },
  service: { label: 'Shops', one: 'Shop', color: '#7ab8ff', blurb: 'Safehouses, garages, fences and gun counters.' },
  landmark: { label: 'Landmarks', one: 'Landmark', color: '#fff3e4', blurb: 'Named buildings and sights, with the real places fans match them to.' },
};
const RANK = { Official: 0, Tested: 1, Reported: 2, Unverified: 3, Patched: 4 };
const REG = Object.fromEntries(MAP.regions.map((r) => [r.id, r]));
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const D = (v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v + 'T12:00:00' : v);
const latest = FEED.latestPatch && FEED.latestPatch.version ? FEED.latestPatch : null;
const PREC = {
  spot: 'Position: checked on the spot.',
  mapped: 'Position: exact, from the community map data (Open GTA 6 Map).',
  near: 'Position: next to it, pinned at the named landmark beside the spot.',
  area: 'Position: approximate, in the town or district the source names.',
  region: 'Position: rough, only the region is known.',
};
const regionName = (p) => REG[p.region]?.name || 'Region not confirmed';
const places = MAP.places.filter((p) => CATS[p.cat]).map((p) => ({ ...p, text: [p.name, p.area, p.summary, p.reward, p.needs, ...(p.how || []), regionName(p)].join(' ').toLowerCase() }));

/* ---------- one row: a summary line that opens to the full card ---------- */
const chev = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('class', 'chev'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M5 8l5 5 5-5'); s.append(p); return s; };
function body(p) {
  const left = h('div', {});
  left.append(h('p', { text: p.summary }));
  if (p.how?.length) left.append(h('h3', { text: 'How' }), h('ol', {}, ...p.how.map((x) => h('li', { text: x }))));
  const right = h('div', {});
  const dl = h('dl', {});
  if (p.reward) dl.append(h('dt', { text: 'You get' }), h('dd', { text: p.reward }));
  if (p.needs) dl.append(h('dt', { text: 'Needs' }), h('dd', { text: p.needs }));
  dl.append(h('dt', { text: 'Where' }), h('dd', { text: [p.area, regionName(p)].filter(Boolean).join(' · ') }));
  if (p.checked) dl.append(h('dt', { text: 'Tested' }), h('dd', { text: `${p.checked.on} on ${p.checked.platform}, v${p.checked.version}` }));
  right.append(dl, h('p', { class: 'prec', text: p.pos ? PREC[p.precision] : 'Not on the map yet: no source says exactly where.' }));
  right.append(h('h3', { text: 'Sources' }), h('ul', { class: 'src' }, ...p.sources.map((s) => h('li', {}, safe(s.url) ? h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.publisher }) : s.publisher, s.read ? h('small', { text: ' · read ' + dateFmt.format(D(s.read)) }) : null))));
  const lastRead = p.sources.map((s) => s.read).filter(Boolean).sort().pop();
  let warn = p.status === 'Tested' ? '' : 'Not tested by us yet.';
  if (latest && lastRead && D(latest.date) > D(lastRead) && !(p.checked && p.checked.version === latest.version)) warn = `Read before update ${latest.version} (${dateFmt.format(D(latest.date))}). It may have changed; check in game.`;
  if (p.statusNote) right.append(h('p', { class: 'warn', text: 'Why ' + p.status + ': ' + p.statusNote }));
  if (warn) right.append(h('p', { class: 'warn', text: warn }));
  const acts = h('div', { class: 'acts' });
  if (p.pos) acts.append(h('a', { class: 'btn', href: 'map.html#p=' + p.id, text: 'Show on the map' }));
  const share = h('button', { class: 'btn ghost', type: 'button', text: 'Copy link' });
  share.addEventListener('click', async () => { const url = location.origin + location.pathname + '#p=' + p.id; try { await navigator.clipboard.writeText(url); share.textContent = 'Link copied'; } catch (e) { share.textContent = 'Copy failed'; } setTimeout(() => { share.textContent = 'Copy link'; }, 2000); });
  acts.append(share);
  right.append(acts);
  return h('div', { class: 'body' }, left, right);
}
function row(p) {
  const d = h('details', { id: 'p-' + p.id },
    h('summary', { style: `--c:${CATS[p.cat].color}` }, h('i', { 'aria-hidden': 'true' }),
      h('span', {}, h('b', { text: p.name }), h('small', { text: [p.area, regionName(p)].filter(Boolean).join(' · ') })),
      h('span', { class: 'lab ' + p.status, text: p.status }), chev()));
  // The body is built the first time a row opens, so 250 rows stay light.
  d.addEventListener('toggle', () => { if (d.open && d.children.length === 1) d.append(body(p)); if (d.open) history.replaceState(null, '', '#p=' + p.id); });
  const li = h('li', {}, d); li._p = p; return li;
}

/* ---------- groups ---------- */
const groups = el('groups'), rowsByCat = {};
for (const [id, c] of Object.entries(CATS)) {
  const list = places.filter((p) => p.cat === id);
  if (!list.length) continue;
  const ul = h('ul', { class: 'rows' }, ...list.map(row));
  const sec = h('section', { class: 'group', id: 'g-' + id, 'aria-labelledby': 'gh-' + id, style: `--c:${c.color}` },
    h('h2', { id: 'gh-' + id }, h('i', { 'aria-hidden': 'true' }), c.label, h('small', { class: 'n' })), h('p', { text: c.blurb }), ul);
  groups.append(sec);
  rowsByCat[id] = { sec, ul, items: [...ul.children] };
}

/* ---------- filters ---------- */
const state = { cat: '', region: '', status: '', q: '', sort: 'name' };
const catsBox = el('cats');
const chip = (id, label, color, n) => {
  const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.cat === id), style: color ? `--c:${color}` : null, 'data-cat': id }, color ? h('i', { 'aria-hidden': 'true' }) : null, `${label} ${n}`);
  b.addEventListener('click', () => { state.cat = id; apply(true); });
  return b;
};
catsBox.append(chip('', 'All', null, places.length), ...Object.entries(CATS).filter(([id]) => rowsByCat[id]).map(([id, c]) => chip(id, c.label, c.color, rowsByCat[id].items.length)));
const regSel = el('region');
for (const r of MAP.regions) regSel.append(h('option', { value: r.id, text: r.name }));
regSel.append(h('option', { value: 'none', text: 'Region not confirmed' }));
regSel.addEventListener('change', () => { state.region = regSel.value; apply(); });
el('status').addEventListener('change', (e) => { state.status = e.target.value; apply(); });
el('sort').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
let qt = 0;
el('q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); apply(); }, 140); });
el('reset').addEventListener('click', () => { Object.assign(state, { cat: '', region: '', status: '', q: '' }); el('q').value = ''; regSel.value = ''; el('status').value = ''; apply(); el('q').focus(); });

const cmp = {
  name: (a, b) => a.name.localeCompare(b.name),
  region: (a, b) => regionName(a).localeCompare(regionName(b)) || a.name.localeCompare(b.name),
  label: (a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name),
};
function apply(scrollTop = false) {
  const terms = state.q.split(/\s+/).filter(Boolean);
  let total = 0;
  for (const [id, g] of Object.entries(rowsByCat)) {
    const show = !state.cat || state.cat === id;
    let n = 0;
    g.items.sort((a, b) => cmp[state.sort](a._p, b._p)).forEach((li) => {
      const p = li._p;
      const ok = show && (!state.region || (state.region === 'none' ? !REG[p.region] : p.region === state.region)) && (!state.status || p.status === state.status) && terms.every((t) => p.text.includes(t));
      li.hidden = !ok; if (ok) n++;
      g.ul.append(li);
    });
    g.sec.hidden = !n;
    g.sec.querySelector('.n').textContent = n === g.items.length ? String(n) : `${n} of ${g.items.length}`;
    total += n;
  }
  for (const b of catsBox.children) b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat));
  el('none').hidden = total > 0;
  const bits = [state.cat && CATS[state.cat].label, state.region && (state.region === 'none' ? 'region not confirmed' : REG[state.region].name), state.status, state.q && `"${state.q}"`].filter(Boolean);
  el('count').textContent = `${total} of ${places.length} spots` + (bits.length ? ' · ' + bits.join(' · ') : '') + ` · updated ${dateFmt.format(D(MAP.updated))}`;
  const hash = state.cat ? '#cat=' + state.cat : '';
  if (location.hash.startsWith('#cat=') || hash) history.replaceState(null, '', hash || location.pathname + location.search);
  if (scrollTop) el('list').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- start: #cat=vehicle filters, #p=id opens that spot ---------- */
function fromHash() {
  const c = (location.hash.match(/^#cat=([a-z]+)$/) || [])[1];
  if (c && CATS[c]) { state.cat = c; apply(); return; }
  const id = (location.hash.match(/^#p=([a-z0-9-]+)$/) || [])[1];
  apply();
  const d = id && document.getElementById('p-' + id);
  if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); d.querySelector('summary').focus({ preventScroll: true }); }
}
fromHash();
addEventListener('hashchange', fromHash);
})();
