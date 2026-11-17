/* Leonida Intel v4: Vice City after dark.
   Reads window.LEONIDA_FEED (data/feed.js, rewritten every 30 minutes by tools/update-feed.mjs).
   One per-second timer drives the countdown, the heat stars and the rolling-release list. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } n.append(...kids.filter(Boolean)); return n; };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FEED = window.LEONIDA_FEED || { clips: [], official: [], news: [], drops: [] };
const HOUR = 3600e3, LAUNCH = Date.UTC(2026, 10, 19);

/* ---------- time zones: when does midnight on 19 Nov reach a zone ---------- */
const fmtCache = {};
function offsetMin(tz, ms) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms) / 6e4);
}
const unlockAt = (tz) => { const t = LAUNCH - offsetMin(tz, LAUNCH) * 6e4; return LAUNCH - offsetMin(tz, t) * 6e4; };
let myTz = 'UTC'; try { myTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
const myUnlock = unlockAt(myTz);
const pretty = (tz) => tz.split('/').pop().replace(/_/g, ' ');
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
const span = (ms) => { const a = Math.max(0, ms), d = Math.floor(a / 864e5), hh = Math.floor(a % 864e5 / HOUR), m = Math.floor(a % HOUR / 6e4); return (d ? d + 'd ' : '') + (d || hh ? hh + 'h ' : '') + m + 'm'; };
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); if (!(m >= 0)) return ''; if (m < 60) return m <= 1 ? 'just now' : m + ' min ago'; const hh = Math.round(m / 60); if (hh < 36) return hh + ' h ago'; return Math.round(hh / 24) + ' days ago'; };
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

const CITIES = [['Auckland','Pacific/Auckland'],['Sydney','Australia/Sydney'],['Tokyo','Asia/Tokyo'],['Seoul','Asia/Seoul'],['Manila','Asia/Manila'],['Singapore','Asia/Singapore'],['Mumbai','Asia/Kolkata'],['Dubai','Asia/Dubai'],['Riyadh','Asia/Riyadh'],['Istanbul','Europe/Istanbul'],['Johannesburg','Africa/Johannesburg'],['Lagos','Africa/Lagos'],['Berlin','Europe/Berlin'],['Paris','Europe/Paris'],['London','Europe/London'],['São Paulo','America/Sao_Paulo'],['New York','America/New_York'],['Miami','America/New_York'],['Toronto','America/Toronto'],['Chicago','America/Chicago'],['Mexico City','America/Mexico_City'],['Denver','America/Denver'],['Los Angeles','America/Los_Angeles'],['Anchorage','America/Anchorage'],['Honolulu','Pacific/Honolulu']]
  .map(([n, tz]) => ({ n, tz, at: unlockAt(tz) }));
const home = CITIES.find((c) => c.tz === myTz);

/* ---------- header ---------- */
const top = el('top');
const onScroll = () => top.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
const nav = el('nav'), menuBtn = el('menu-btn');
function setMenu(open) { nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.textContent = open ? 'Close' : 'Menu'; document.body.style.overflow = open ? 'hidden' : ''; if (open) nav.querySelector('a').focus(); }
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
nav.addEventListener('click', (e) => { if (e.target.closest('a') && nav.classList.contains('open')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });

/* ---------- heat stars ---------- */
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
const stars = el('stars'); stars.innerHTML = STAR.repeat(5);
function heat(left) { return left <= 0 ? 5 : left < HOUR ? 5 : left < 6 * HOUR ? 4 : left < 24 * HOUR ? 3 : left < 48 * HOUR ? 2 : 1; }

/* ---------- countdown ---------- */
el('when').textContent = longFmt.format(new Date(myUnlock));
el('zone').textContent = home ? home.n : pretty(myTz);
el('deadline').textContent = longFmt.format(new Date(myUnlock));
const PRELOAD = Date.UTC(2026, 10, 10, 14);
const pad = (n) => String(n).padStart(2, '0');
function tick() {
  const now = Date.now(), left = myUnlock - now;
  if (left > 0) {
    el('cd-d').textContent = pad(Math.floor(left / 864e5)); el('cd-h').textContent = pad(Math.floor(left % 864e5 / HOUR));
    el('cd-m').textContent = pad(Math.floor(left % HOUR / 6e4)); el('cd-s').textContent = pad(Math.floor(left % 6e4 / 1e3));
  } else el('clock').classList.add('is-open');
  el('bar').style.transform = `scaleX(${Math.min(1, Math.max(0, (now - PRELOAD) / (myUnlock - PRELOAD))).toFixed(4)})`;
  const lv = heat(left);
  $$('svg', stars).forEach((s, i) => s.classList.toggle('on', i < lv));
  stars.classList.toggle('flash', left > 0 && left < HOUR);
  stars.setAttribute('aria-label', `Heat level ${lv} of 5`);
  const firstIn = CITIES.filter((c) => c.at <= now).length;
  el('first-note').textContent = firstIn === 0 ? 'New Zealand gets in first. Hawaii goes last.' : firstIn < CITIES.length ? `${firstIn} of ${CITIES.length} cities on our list are already in.` : 'Every time zone is in. Leonida is open worldwide.';
  orderTick(now);
  setTimeout(tick, 1000 - (Date.now() % 1000));
}

/* ---------- rolling release order ---------- */
const order = el('order');
const rows = [...CITIES].sort((a, b) => a.at - b.at);
if (!home) rows.push({ n: 'You (' + pretty(myTz) + ')', tz: myTz, at: myUnlock, me: true });
rows.sort((a, b) => a.at - b.at);
for (const c of rows) {
  const li = h('li', { 'data-at': c.at }, h('b', { text: c.n }), h('small', { text: '' }));
  if (c.me || (home && c === home)) li.classList.add('me');
  order.append(li);
}
const more = el('more');
let showAll = matchMedia('(min-width: 981px)').matches;
function trim() {
  const lis = [...order.children], now = Date.now();
  let start = lis.findIndex((li) => +li.dataset.at > now); if (start < 0) start = lis.length - 6;
  start = Math.max(0, start - 1);
  lis.forEach((li, i) => li.classList.toggle('hide', !showAll && !(i >= start && i < start + 6) && !li.classList.contains('me')));
  more.textContent = showAll ? 'Show the next six' : `Show all ${lis.length} cities`;
  more.setAttribute('aria-expanded', String(showAll));
}
more.addEventListener('click', () => { showAll = !showAll; trim(); });
function orderTick(now) {
  for (const li of order.children) { const dt = +li.dataset.at - now; li.lastChild.textContent = dt > 0 ? 'in ' + span(dt) : "it's live"; li.classList.toggle('in', dt <= 0); }
}

/* ---------- caution-tape headlines ---------- */
const tapeRun = el('tape-run');
const tapeItems = [
  ...(FEED.drops || []).slice(0, 3).map((d) => ({ t: d.title, s: 'Leonida Intel', l: d.link || '#wire' })),
  ...(FEED.news || []).slice(0, 10).map((n) => ({ t: n.title, s: n.source, l: n.link })),
];
if (!tapeItems.length) tapeItems.push({ t: 'GTA VI unlocks at midnight local time on Thursday 19 November', s: 'Leonida Intel', l: '#facts' });
const tapeOnce = () => tapeItems.map((x) => h('a', { href: x.l, ...(x.l.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}) }, x.t + ' ', h('em', { text: '· ' + x.s })));
tapeRun.append(...tapeOnce());
const dup = h('span', { 'aria-hidden': 'true', style: 'display:contents' }); dup.append(...tapeOnce()); $$('a', dup).forEach((a) => a.tabIndex = -1); tapeRun.append(dup);
const tape = el('tape'), tapePause = el('tape-pause');
tapePause.addEventListener('click', () => { const p = tape.classList.toggle('paused'); tapePause.setAttribute('aria-pressed', String(p)); tapePause.setAttribute('aria-label', p ? 'Play headlines' : 'Pause headlines'); tapePause.innerHTML = p ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>'; });
tape.addEventListener('focusin', () => tape.classList.add('paused'));
tape.addEventListener('focusout', () => { if (tapePause.getAttribute('aria-pressed') !== 'true') tape.classList.remove('paused'); });

/* ---------- videos ---------- */
const thumb = (id, q = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const embed = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
const seenT = new Set();
const official = (FEED.official || []).filter((v) => { const k = v.title.toLowerCase(); if (seenT.has(k)) return false; seenT.add(k); return true; });
const mine = (FEED.clips || []);
const launchVid = official.find((v) => /launch trailer/i.test(v.title) && !v.short) || official.find((v) => !v.short) || { id: 'rz1B4B2yBZY', title: 'Grand Theft Auto VI Launch Trailer', from: 'rockstar' };
const screen = el('screen');
let current = null;
function cue(v, play = false) {
  current = v;
  screen.replaceChildren();
  const label = v.from === 'rockstar' ? 'Rockstar Games' : (FEED.channel?.name || 'Scoota');
  el('now-title').textContent = v.title || 'Untitled clip';
  el('now-meta').textContent = label + (v.date ? ' · ' + dateFmt.format(new Date(v.date)) : '');
  $$('.list button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === v.id)));
  if (play) { screen.append(h('iframe', { src: embed(v.id), title: v.title || 'Video', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '' })); return; }
  const img = h('img', { src: thumb(v.id, 'maxresdefault'), alt: '', loading: 'lazy', width: '1280', height: '720' });
  img.addEventListener('load', () => { if (img.naturalWidth < 200) img.src = thumb(v.id); }, { once: true });
  img.addEventListener('error', () => { img.src = thumb(v.id); }, { once: true });
  const b = h('button', { class: 'poster-btn', type: 'button', 'aria-label': 'Play ' + (v.title || 'video') }, img,
    h('span', { class: 'play', 'aria-hidden': 'true' }), h('span', { class: 'bug', 'aria-hidden': 'true' }, h('span', { class: 'live', text: v.from === 'rockstar' ? 'Official' : 'Scoota' }), h('span', { text: 'CH 06' })));
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
      h('span', {}, h('b', { text: v.title || 'Clip' }), h('small', { text: (v.from === 'rockstar' ? 'Rockstar Games' : (FEED.channel?.name || 'Scoota')) + (v.date ? ' · ' + dateFmt.format(new Date(v.date)) : '') })));
    b.addEventListener('click', () => { cue(v); screen.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' }); });
    ul.append(h('li', {}, b));
  }
  return ul;
}
const emptyMine = h('div', { class: 'empty' },
  h('b', { class: 'poster', style: 'display:block;font-size:2.2rem;margin-bottom:8px', text: 'Launch night, filmed live' }),
  h('p', { text: 'Scoota goes on air in Leonida the minute it opens. Every clip posted to the channel lands on this screen within 30 minutes. Until then, the official drops are one tab over.' }),
  h('a', { class: 'link', href: FEED.channel?.url || 'https://www.youtube.com/@ShotByScoota', target: '_blank', rel: 'noopener', text: 'Go to the channel →' }));
el('panel-mine').append(listOf(mine, emptyMine));
el('panel-off').append(listOf(official, h('p', { class: 'empty', text: 'Official videos load here.' })));
const tabs = [el('tab-mine'), el('tab-off')];
function selectTab(t, focus) { tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; el(x.getAttribute('aria-controls')).hidden = !on; }); if (focus) t.focus(); }
tabs.forEach((t, i) => { t.addEventListener('click', () => selectTab(t)); t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); } }); });
cue(mine.find((c) => c.pin) || mine[0] || launchVid);

/* lightbox for the hero and close buttons */
const dlg = el('vid');
function openVid(v) {
  if (typeof dlg.showModal !== 'function') { open('https://www.youtube.com/watch?v=' + v.id, '_blank', 'noopener'); return; }
  el('vid-title').textContent = v.title; el('vid-frame').replaceChildren(h('iframe', { src: embed(v.id), title: v.title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '' }));
  dlg.showModal();
}
const closeVid = () => { dlg.close(); };
dlg.addEventListener('close', () => el('vid-frame').replaceChildren());
el('vid-x').addEventListener('click', closeVid);
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeVid(); });
$$('[data-play="launch"]').forEach((b) => b.addEventListener('click', () => openVid(launchVid)));

/* ---------- The Wire ---------- */
const KEY = /release|launch|midnight|unlock|preload|pre-load|trailer|price|time|download|size|day one|update|ps5|xbox/i;
const news = [...(FEED.news || [])].sort((x, y) => (KEY.test(y.title) - KEY.test(x.title)));
if (news[0]) {
  el('lead-link').textContent = news[0].title; el('lead-link').href = news[0].link;
  el('lead-body').textContent = `${news[0].source} · ${ago(news[0].date)}. The top GTA VI story right now, picked from Google News.`;
  $('.stamp', el('lead')).textContent = 'Front page · ' + news[0].source;
}
const stories = el('stories');
for (const n of news.slice(1).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)) stories.append(h('a', { class: 'story', href: n.link, target: '_blank', rel: 'noopener' }, h('span', { class: 'src', text: n.source }), h('b', { text: n.title }), h('small', { text: ago(n.date) })));
if (!stories.children.length) stories.append(h('p', { class: 'story', text: 'Headlines load here as they land.' }));
const drops = el('drops');
for (const d of (FEED.drops || []).slice(0, 3)) {
  const kids = [h('span', { class: 'lab ' + (d.label || 'Crew'), text: d.label || 'Crew' }), h('b', { text: d.title }), h('p', { text: d.body || '' })];
  if (d.link) kids.push(h('a', { class: 'link', href: d.link, target: '_blank', rel: 'noopener', text: 'Source →' }));
  drops.append(h('article', { class: 'drop' }, ...kids));
}
if (FEED.updated) el('fresh').textContent = 'Updated ' + ago(FEED.updated) + ' · refreshes every 30 min';

/* ---------- the job ---------- */
let saved = {}; try { saved = JSON.parse(localStorage.getItem('li-kit') || '{}'); } catch (e) {}
let platform = 'ps5'; try { platform = localStorage.getItem('li-platform') || 'ps5'; } catch (e) {}
const plat = $$('input[name="plat"]'), boxes = $$('.steps input');
function meter() { const vis = boxes.filter((b) => !b.closest('.steps').hidden), n = vis.filter((b) => b.checked).length; el('prep-n').textContent = n; el('prep-of').firstChild.textContent = n === vis.length ? 'all done. You are ready.' : `of ${vis.length} done`; }
function setPlatform(p) { platform = p; plat.forEach((r) => r.checked = r.value === p); $$('.steps').forEach((o) => o.hidden = o.dataset.platform !== p); try { localStorage.setItem('li-platform', p); } catch (e) {} meter(); }
plat.forEach((r) => r.addEventListener('change', () => setPlatform(r.value)));
boxes.forEach((b) => { b.checked = !!saved[b.dataset.k]; b.addEventListener('change', () => { saved[b.dataset.k] = b.checked; try { localStorage.setItem('li-kit', JSON.stringify(saved)); } catch (e) {} meter(); }); });
setPlatform(platform);
const gb = el('free-gb'), gbOut = el('gb-out');
function space() {
  const v = parseFloat(gb.value);
  if (!(v >= 0)) { gbOut.textContent = 'You need up to 212 GB. Type what your console shows.'; gbOut.className = ''; return; }
  const need = 212 - v;
  if (need > 0) { gbOut.textContent = `Free about ${Math.ceil(need)} GB more. That is roughly one or two big games.`; gbOut.className = 'short'; }
  else { gbOut.textContent = `You have room, with about ${Math.floor(-need)} GB to spare. Keep some extra for day-one updates.`; gbOut.className = 'ok'; }
}
gb.addEventListener('input', space);
el('ics').addEventListener('click', () => {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Leonida Intel//Launch night//EN', 'BEGIN:VEVENT', 'UID:gta6-' + myUnlock + '@leonida-intel', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(myUnlock), 'DTEND:' + z(myUnlock + HOUR),
    'SUMMARY:GTA VI unlocks (midnight\\, ' + (home ? home.n : pretty(myTz)) + ')', 'DESCRIPTION:Grand Theft Auto VI unlocks at midnight local time. Preload done? Updates installed? (Leonida Intel\\, unofficial fan site)',
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:GTA VI unlocks in 30 minutes', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'gta-vi-my-midnight.ics' });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  el('ics-msg').textContent = 'Calendar file saved. Open it to add your midnight, with a reminder 30 minutes before.';
});

/* ---------- share ---------- */
el('share').addEventListener('click', async () => {
  const url = location.href.split('#')[0], text = `GTA VI unlocks ${longFmt.format(new Date(myUnlock))} where I am. Countdown, clips and the prep list:`;
  const out = el('share-out');
  try { if (navigator.share) { await navigator.share({ title: 'Leonida Intel', text, url }); out.textContent = 'Sent.'; return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); out.textContent = 'Link copied. Paste it in the group chat.'; }
  catch (e) { out.textContent = 'Copy this link: ' + url; }
});

trim(); setInterval(trim, 60000);
tick();
})();
