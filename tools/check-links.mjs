// Dead-link check for the pages in dist/. No dependencies.
//   node tools/check-links.mjs                 every page, local links only (fast, no network)
//   node tools/check-links.mjs --external      also open every outside link
//   node tools/check-links.mjs dist/howto.html --external
// Checks: local files exist; "#id" targets exist on their page; map.html#p=<id> pins exist in
// dist/data/map.js; outside links answer below 400 (redirects followed, one slower retry).
// Exit code 1 when anything is broken. Uses an honest user agent; a site that refuses robots is
// reported as "blocked" so a person can check it in a browser, never worked around.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const args = process.argv.slice(2);
const external = args.includes('--external');
const files = args.filter((a) => !a.startsWith('--')).map((f) => resolve(f));
const pages = files.length ? files : readdirSync(dist).filter((f) => f.endsWith('.html')).map((f) => join(dist, f));
const UA = 'LeonidaIntelLinkCheck/1.0 (+https://gtadropz.netlify.app)';

const ids = new Map();   // page path -> Set of ids
const idsOf = (p) => {
  if (!ids.has(p)) ids.set(p, new Set([...readFileSync(p, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return ids.get(p);
};
let pins = null;
const pinIds = () => {
  if (!pins) {
    const t = readFileSync(join(dist, 'data/map.js'), 'utf8');
    pins = new Set([...t.matchAll(/"id"\s*:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
  }
  return pins;
};

const problems = [], outside = new Map();   // url -> [pages]
for (const page of pages) {
  const html = readFileSync(page, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const name = relative(root, page);
  for (const m of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const raw = m[2].replace(/&amp;/g, '&');
    if (!raw || /^(data:|mailto:|tel:|javascript:)/i.test(raw)) continue;
    // our own site's address (canonical, og:image, sitemap) means the file in dist/: it only goes live on deploy
    const own = raw.match(/^https:\/\/gtadropz\.netlify\.app(\/[^#?]*)?/);
    if (own) { const f = join(dist, (own[1] || '/').replace(/\/$/, '/index.html')); if (!existsSync(f)) problems.push(`${name}: own-site link has no file in dist ${raw}`); continue; }
    if (/^https?:\/\//i.test(raw)) { if (!outside.has(raw)) outside.set(raw, []); outside.get(raw).push(name); continue; }
    if (raw.startsWith('//')) { problems.push(`${name}: protocol-relative link ${raw}`); continue; }
    const [pathPart, hash = ''] = raw.split('#');
    const target = pathPart ? resolve(dirname(page), pathPart.split('?')[0]) : page;
    const file = existsSync(target) && !target.endsWith('\\') && !target.endsWith('/') ? target : join(target, 'index.html');
    if (!existsSync(file)) { problems.push(`${name}: missing file ${raw}`); continue; }
    if (!hash) continue;
    if (/^p=/.test(hash)) { if (!pinIds().has(hash.slice(2))) problems.push(`${name}: map pin not found ${raw}`); continue; }
    if (file.endsWith('.html') && !idsOf(file).has(decodeURIComponent(hash))) problems.push(`${name}: anchor not found ${raw}`);
  }
}

async function check(url, timeout) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  await r.body?.cancel();
  return r.status;
}
const blocked = [];
if (external) {
  const list = [...outside.keys()];
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < list.length) {
      const url = list[i++];
      let status = 0, err = '';
      for (const t of [20000, 40000]) {
        try { status = await check(url, t); err = ''; if (status < 400) break; } catch (e) { err = e.name === 'TimeoutError' ? 'timeout' : String(e.cause?.code || e.message); }
      }
      const where = [...new Set(outside.get(url))].join(', ');
      if (status && status < 400) continue;
      if (status === 401 || status === 403 || status === 429) blocked.push(`${status} ${url}  (on ${where})`);
      else problems.push(`${err || status} ${url}  (on ${where})`);
    }
  }));
}

const n = pages.length, ext = outside.size;
console.log(`${n} page(s), ${ext} outside link(s)${external ? ' opened' : ' not opened (add --external)'}`);
for (const b of blocked) console.log('BLOCKED ' + b + '  -> refuses robots; open it in a browser to confirm');
for (const p of problems) console.log('BROKEN  ' + p);
console.log(problems.length ? `${problems.length} broken link(s)` : 'no broken links');
process.exit(problems.length ? 1 : 0);
