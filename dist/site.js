/* Leonida Intel v5: post-launch desk, same Vice City after dark look.
   Reads window.LEONIDA_FEED (data/feed.js), written by tools/update-feed.mjs after each 30-minute scan.
   Every string from the feed is set with textContent; nothing from a source is ever parsed as HTML. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } n.append(...kids.filter(Boolean)); return n; };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FEED = window.LEONIDA_FEED || { clips: [], official: [], news: [], drops: [], intel: [], patches: [] };
const INTEL = FEED.intel || [];
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); if (!(m >= 0)) return ''; if (m < 60) return m <= 1 ? 'just now' : m + ' min ago'; const hh = Math.round(m / 60); if (hh < 36) return hh + ' h ago'; return Math.round(hh / 24) + ' days ago'; };
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const safe = (u) => /^https?:\/\//.test(u || '') ? u : null;
const ext = (u) => safe(u) ? { href: u, target: '_blank', rel: 'noopener' } : {};
const pad = (n) => String(n).padStart(2, '0');
// A date-only value (2026-11-23) is a calendar day, not UTC midnight: read it at local noon so no time zone shifts the day.
const D = (v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v + 'T12:00:00' : v);

/* ---------- header ---------- */
const top = el('top');
const onScroll = () => top.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
const nav = el('nav'), menuBtn = el('menu-btn');
function setMenu(open) { nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.textContent = open ? 'Close' : 'Menu'; document.body.style.overflow = open ? 'hidden' : ''; if (open) nav.querySelector('a').focus(); }
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
nav.addEventListener('click', (e) => { if (e.target.closest('a') && nav.classList.contains('open')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });

/* ---------- heat = new checked intel in the last 24 hours ---------- */
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
const stars = el('stars'); stars.innerHTML = STAR.repeat(5);
const fresh24 = INTEL.filter((i) => i.status !== 'Unverified' && Date.now() - D(i.date || i.firstSeen) < 864e5).length;
const lv = fresh24 >= 10 ? 5 : fresh24 >= 6 ? 4 : fresh24 >= 3 ? 3 : fresh24 >= 1 ? 2 : 1;
$$('svg', stars).forEach((s, i) => s.classList.toggle('on', i < lv));
stars.setAttribute('aria-label', `Heat level ${lv} of 5: ${fresh24} new checked findings in the last 24 hours`);

/* ---------- desk status (hero) ---------- */
const latest = FEED.latestPatch;
if (latest?.version) { for (const id of ['hero-patch', 'kit-patch']) el(id).textContent = latest.version; }
const count = (st) => INTEL.filter((i) => i.status === st).length;
el('n-official').textContent = pad(count('Official'));
el('n-tested').textContent = pad(count('Tested'));
el('n-reported').textContent = pad(count('Reported'));
el('n-leads').textContent = pad(count('Unverified'));
const srcs = FEED.sources || [], okN = srcs.filter((s) => s.ok).length;
if (FEED.checked) el('desk-scan').textContent = 'published ' + ago(FEED.checked);
el('bar').style.transform = `scaleX(${srcs.length ? (okN / srcs.length).toFixed(3) : 1})`;
el('desk-note').textContent = (srcs.length ? `${okN} of ${srcs.length} sources answered the last scan. ` : '') +
  (latest?.version ? `Latest update ${latest.version} (${dateFmt.format(D(latest.date))}, ${latest.status}).` : 'Every finding carries its source and a label.');

/* ---------- caution-tape headlines ---------- */
const tapeRun = el('tape-run');
const tapeItems = [
  ...INTEL.filter((i) => i.status === 'Official').slice(0, 3).map((i) => ({ t: i.title, s: 'Rockstar Games', l: i.url })),
  ...(FEED.news || []).slice(0, 8).map((n) => ({ t: n.title, s: n.source, l: n.link })),
].filter((x) => safe(x.l));
if (!tapeItems.length) tapeItems.push({ t: 'GTA VI is out on PS5 and Xbox Series X|S', s: 'Leonida Intel', l: '#facts' });
const tapeOnce = () => tapeItems.map((x) => h('a', { href: x.l, ...(safe(x.l) ? { target: '_blank', rel: 'noopener' } : {}) }, x.t + ' ', h('em', { text: '· ' + x.s })));
tapeRun.append(...tapeOnce());
const dup = h('span', { 'aria-hidden': 'true', style: 'display:contents' }); dup.append(...tapeOnce()); $$('a', dup).forEach((a) => a.tabIndex = -1); tapeRun.append(dup);
const tape = el('tape'), tapePause = el('tape-pause');
tapePause.addEventListener('click', () => { const p = tape.classList.toggle('paused'); tapePause.setAttribute('aria-pressed', String(p)); tapePause.setAttribute('aria-label', p ? 'Play headlines' : 'Pause headlines'); tapePause.innerHTML = p ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>'; });
tape.addEventListener('focusin', () => tape.classList.add('paused'));
tape.addEventListener('focusout', () => { if (tapePause.getAttribute('aria-pressed') !== 'true') tape.classList.remove('paused'); });

/* ---------- tabs (shared by the intel board and SX TV) ---------- */
function tablist(tabs) {
  function select(t, focus) { tabs.forEach((x) => { const on = x === t, id = x.getAttribute('aria-controls'); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; el(id).hidden = !on; const m = $(`.more-row[data-for="${id}"]`); if (m) m.hidden = !on; }); if (focus) t.focus(); }
  tabs.forEach((t, i) => { t.addEventListener('click', () => select(t)); t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); } }); });
  return select;
}

/* ---------- the intel board ---------- */
const CAT_EMPTY = { official: 'No Rockstar posts picked up yet.', patch: 'No patch reports yet.', cheat: 'No cheat reports yet.', glitch: 'No glitch reports yet.', secret: 'No secrets reported yet.' };
const yn = (v) => v === true ? 'Yes' : v === false ? 'No' : 'Not checked';
function card(i) {
  const metaBits = [h('b', { text: i.publisher })];
  if (i.platform) metaBits.push(' · ' + i.platform);
  if (i.version) metaBits.push(' · v' + i.version);
  if (i.date) metaBits.push(' · ' + dateFmt.format(D(i.date)));
  const kids = [
    h('div', { class: 'ctop' }, h('span', { class: 'lab ' + i.status, text: i.status === 'Patched' ? 'Patched / outdated' : i.status }), h('span', { text: i.kind === 'desk' ? 'Desk' : i.kind === 'official' ? 'Primary source' : '' })),
    h('h3', {}, safe(i.url) ? h('a', ext(i.url), i.title) : i.title),
    h('p', { class: 'meta' }, ...metaBits),
  ];
  if (i.cheat) kids.push(h('dl', {}, h('dt', { text: 'Input' }), h('dd', { text: i.cheat.input || 'Not confirmed' }), h('dt', { text: 'Unlock' }), h('dd', { text: i.cheat.unlock || 'Not confirmed' }),
    h('dt', { text: 'Blocks saves' }), h('dd', { text: yn(i.cheat.affectsSaves) }), h('dt', { text: 'Blocks trophies' }), h('dd', { text: yn(i.cheat.affectsAchievements) })));
  if (i.tested) kids.push(h('p', { class: 'meta', text: `Tested ${i.tested.on} on ${i.tested.platform}, version ${i.tested.version}` }));
  if (i.evidence) kids.push(h('p', { class: 'ev', text: i.evidence }));
  if (i.note) kids.push(h('p', { class: 'warn', text: i.note }));
  kids.push(h('p', { class: 'meta', text: `First seen ${timeFmt.format(new Date(i.firstSeen))} · last checked ${ago(i.lastChecked) || timeFmt.format(new Date(i.lastChecked))}` }));
  return h('article', { class: 'card' + (i.status === 'Unverified' ? ' lead-u' : '') }, ...kids);
}
for (const cat of ['official', 'patch', 'cheat', 'glitch', 'secret']) {
  const panel = el('p-' + cat);
  const items = INTEL.filter((i) => i.cat === cat);
  const checked = items.filter((i) => i.status !== 'Unverified'), leads = items.filter((i) => i.status === 'Unverified');
  if (!items.length) panel.append(h('p', { class: 'none', text: CAT_EMPTY[cat] }));
  const SHOW = matchMedia('(max-width: 640px)').matches ? 3 : 6;
  panel.append(...checked.map((i, n) => { const c = card(i); if (n >= SHOW) c.classList.add('x'); return c; }));
  if (leads.length) panel.append(h('p', { class: 'sub x', text: 'Street leads · not checked, treat as rumour' }), ...leads.map((i) => { const c = card(i); c.classList.add('x'); return c; }));
  const hidden = panel.querySelectorAll('.card.x').length;
  if (hidden) {
    const btn = h('button', { class: 'more-intel', type: 'button', 'aria-expanded': 'false', text: `Show all ${items.length}` + (leads.length ? ` (incl. ${leads.length} unverified)` : '') });
    btn.addEventListener('click', () => { const all = panel.classList.toggle('all'); btn.setAttribute('aria-expanded', String(all)); btn.textContent = all ? 'Show fewer' : `Show all ${items.length}` + (leads.length ? ` (incl. ${leads.length} unverified)` : ''); if (!all) panel.scrollIntoView({ block: 'start', behavior: RM ? 'auto' : 'smooth' }); });
    panel.after(h('div', { class: 'more-row', 'data-for': panel.id, hidden: panel.hidden ? '' : null }, btn));
  }
}
const intelTabs = $$('#intel-tabs [role="tab"]');
intelTabs.forEach((t) => { const n = INTEL.filter((i) => i.cat === t.dataset.cat).length; if (n) t.append(' ', h('small', { text: '(' + n + ')' })); });
tablist(intelTabs);

/* ---------- patch log ---------- */
const plog = el('plog');
for (const p of FEED.patches || []) {
  plog.append(h('li', {},
    h('div', { class: 'v' }, p.version || 'Pre-launch', h('small', { text: (p.date ? dateFmt.format(D(p.date)) : '') + (p.platforms ? ' · ' + p.platforms : '') })),
    h('p', {}, p.summary || '', p.size || p.source ? h('small', { text: [p.size, p.source && 'Source: ' + p.source].filter(Boolean).join(' · ') }) : null),
    h(safe(p.url) ? 'a' : 'span', { class: 'lab ' + (p.status || 'Reported'), ...ext(p.url), text: p.status || 'Reported' })));
}
if (!plog.children.length) plog.append(h('li', {}, h('p', { text: 'No updates logged yet.' })));

/* ---------- videos ---------- */
const thumb = (id, q = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const embed = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
const seenT = new Set();
const official = (FEED.official || []).filter((v) => { const k = v.title.toLowerCase(); if (seenT.has(k)) return false; seenT.add(k); return true; });
const mine = (FEED.clips || []);
const launchVid = official.find((v) => /launch trailer/i.test(v.title) && !v.short) || official.find((v) => !v.short) || { id: 'rz1B4B2yBZY', title: 'Grand Theft Auto VI Launch Trailer', from: 'rockstar' };
const screen = el('screen');
function cue(v, play = false) {
  screen.replaceChildren();
  const label = v.from === 'rockstar' ? 'Rockstar Games' : (FEED.channel?.name || 'SX Exclusive');
  el('now-title').textContent = v.title || 'Untitled clip';
  el('now-meta').textContent = label + (v.date ? ' · ' + dateFmt.format(new Date(v.date)) : '');
  $$('.list button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === v.id)));
  if (play) { screen.append(h('iframe', { src: embed(v.id), title: v.title || 'Video', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '' })); return; }
  const img = h('img', { src: thumb(v.id, 'maxresdefault'), alt: '', loading: 'lazy', width: '1280', height: '720' });
  img.addEventListener('load', () => { if (img.naturalWidth < 200) img.src = thumb(v.id); }, { once: true });
  img.addEventListener('error', () => { img.src = thumb(v.id); }, { once: true });
  const b = h('button', { class: 'poster-btn', type: 'button', 'aria-label': 'Play ' + (v.title || 'video') }, img,
    h('span', { class: 'play', 'aria-hidden': 'true' }), h('span', { class: 'bug', 'aria-hidden': 'true' }, h('span', { class: 'live', text: v.from === 'rockstar' ? 'Official' : 'SX Exclusive' }), h('span', { text: 'CH 06' })));
  b.querySelector('.play').innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>';
  b.addEventListener('click', () => cue(v, true));
  screen.append(b);
}
function listOf(items, empty) {
  if (!items.length) return empty;
  const ul = h('ul', { class: 'list' });
  for (const v of items.slice(0, 5)) {
    const b = h('button', { type: 'button', 'data-id': v.id },
      h('span', { class: 'th' }, h('img', { src: thumb(v.id, 'mqdefault'), alt: '', loading: 'lazy', width: '320', height: '180' }), v.short ? h('span', { class: 's', text: 'SHORT' }) : null),
      h('span', {}, h('b', { text: v.title || 'Clip' }), h('small', { text: (v.from === 'rockstar' ? 'Rockstar Games' : (FEED.channel?.name || 'SX Exclusive')) + (v.date ? ' · ' + dateFmt.format(new Date(v.date)) : '') })));
    b.addEventListener('click', () => { cue(v); screen.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' }); });
    ul.append(h('li', {}, b));
  }
  return ul;
}
const emptyMine = h('div', { class: 'empty' },
  h('b', { class: 'poster', style: 'display:block;font-size:2.2rem;margin-bottom:8px', text: 'SX Shorts land here' }),
  h('p', { text: 'When SX Exclusive posts a GTA VI video, it shows on this screen after the next scan. Until then, Rockstar’s official drops are one tab over.' }),
  h('a', { class: 'link', href: FEED.channel?.url || 'https://www.youtube.com/@SXExclusive', target: '_blank', rel: 'noopener', text: 'Go to the channel →' }));
el('panel-mine').append(listOf(mine, emptyMine));
el('panel-off').append(listOf(official, h('p', { class: 'empty', text: 'Official videos load here.' })));
tablist([el('tab-mine'), el('tab-off')]);
cue(mine.find((c) => c.pin) || mine[0] || launchVid);

/* lightbox for the hero and close buttons */
const dlg = el('vid');
function openVid(v) {
  if (typeof dlg.showModal !== 'function') { open('https://www.youtube.com/watch?v=' + v.id, '_blank', 'noopener'); return; }
  el('vid-title').textContent = v.title; el('vid-frame').replaceChildren(h('iframe', { src: embed(v.id), title: v.title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '' }));
  dlg.showModal();
}
dlg.addEventListener('close', () => el('vid-frame').replaceChildren());
el('vid-x').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$$('[data-play="launch"]').forEach((b) => b.addEventListener('click', () => openVid(launchVid)));

/* ---------- The Wire ---------- */
const KEY = /patch|update|fix|hotfix|cheat|glitch|bug|exploit|secret|easter egg|rockstar|ps5|xbox/i;
const news = [...(FEED.news || [])].sort((x, y) => (KEY.test(y.title) - KEY.test(x.title)));
if (news[0] && safe(news[0].link)) {
  el('lead-link').textContent = news[0].title; el('lead-link').href = news[0].link;
  el('lead-body').textContent = `${news[0].source} · ${ago(news[0].date)}. Picked from Google News; open the outlet for the full story.`;
  $('.stamp', el('lead')).textContent = 'Front page · ' + news[0].source;
}
const stories = el('stories');
for (const n of news.slice(1).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) if (safe(n.link)) stories.append(h('a', { class: 'story', ...ext(n.link) }, h('span', { class: 'src', text: n.source }), h('b', { text: n.title }), h('small', { text: ago(n.date) })));
if (!stories.children.length) stories.append(h('p', { class: 'story', text: 'Headlines load here as they land.' }));
const drops = el('drops');
for (const d of (FEED.drops || []).slice(0, 3)) {
  const kids = [h('span', { class: 'lab ' + (d.label || 'Crew'), text: d.label || 'Crew' }), h('b', { text: d.title }), h('p', { text: d.body || '' })];
  if (safe(d.link)) kids.push(h('a', { class: 'link', ...ext(d.link), text: 'Source →' }));
  drops.append(h('article', { class: 'drop' }, ...kids));
}
if (FEED.updated) {
  const t = new Date(FEED.updated), old = Date.now() - t > 13 * 3600e3;
  el('fresh').textContent = 'Published ' + new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(t) + ' · ' + ago(FEED.updated) + ' · scans every 30 min';
  el('fresh').parentElement.classList.toggle('stale', old);
}

/* ---------- the kit ---------- */
let saved = {}; try { saved = JSON.parse(localStorage.getItem('li-kit2') || '{}'); } catch (e) {}
let platform = 'ps5'; try { platform = localStorage.getItem('li-platform') || 'ps5'; } catch (e) {}
const plat = $$('input[name="plat"]'), boxes = $$('.steps input');
function meter() { const vis = boxes.filter((b) => !b.closest('.steps').hidden), n = vis.filter((b) => b.checked).length; el('prep-n').textContent = n; el('prep-of').firstChild.textContent = n === vis.length ? 'all done. Stay safe out there.' : `of ${vis.length} done`; }
function setPlatform(p) { plat.forEach((r) => r.checked = r.value === p); $$('.steps').forEach((o) => o.hidden = o.dataset.platform !== p); try { localStorage.setItem('li-platform', p); } catch (e) {} meter(); }
plat.forEach((r) => r.addEventListener('change', () => setPlatform(r.value)));
boxes.forEach((b) => { b.checked = !!saved[b.dataset.k]; b.addEventListener('change', () => { saved[b.dataset.k] = b.checked; try { localStorage.setItem('li-kit2', JSON.stringify(saved)); } catch (e) {} meter(); }); });
setPlatform(platform);
const ver = el('my-ver'), verOut = el('ver-out');
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return Math.sign(d); } return 0; };
function versionCheck() {
  const v = ver.value.trim().replace(/^v/i, '').replace(/^0(?=1\.)/, '');
  const want = latest?.version;
  verOut.className = '';
  if (!want) { verOut.textContent = 'No update logged yet.'; return; }
  if (!/^\d+\.\d+\.\d+$/.test(v)) { verOut.textContent = `The latest update we can source is ${want}. Type yours like 1.002.002.`; return; }
  const c = cmpV(v, want);
  if (c === 0) { verOut.textContent = `You are on ${want}, the latest update we can source.`; verOut.className = 'ok'; }
  else if (c < 0) { verOut.textContent = `Update available: ${want}. Install it before you test any glitch.`; verOut.className = 'short'; }
  else { verOut.textContent = `${v} is newer than our log (${want}). A new update may be out; the scanner will pick it up.`; verOut.className = 'new'; }
}
ver.addEventListener('input', versionCheck); versionCheck();

/* ---------- share ---------- */
el('share').addEventListener('click', async () => {
  const url = location.href.split('#')[0], text = 'GTA VI patches, cheats, glitches and secrets, each labelled with its source:';
  const out = el('share-out');
  try { if (navigator.share) { await navigator.share({ title: 'Leonida Intel', text, url }); out.textContent = 'Sent.'; return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); out.textContent = 'Link copied. Paste it in the group chat.'; }
  catch (e) { out.textContent = 'Copy this link: ' + url; }
});
})();
