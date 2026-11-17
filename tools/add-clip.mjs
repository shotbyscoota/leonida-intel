#!/usr/bin/env node
// Usage: node tools/add-clip.mjs <youtube link> ["title"] [--pin]
// Adds the clip to content/clips.json, then rebuilds the feed so the page shows it.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [url, ...rest] = process.argv.slice(2);
if (!url) { console.log('Usage: node tools/add-clip.mjs <youtube link> ["title"] [--pin]'); process.exit(1); }
const id = (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(url) ? url : null);
if (!id) { console.log('That does not look like a YouTube link.'); process.exit(1); }
const pin = rest.includes('--pin'); const title = rest.filter((r) => r !== '--pin').join(' ');
const f = new URL('../content/clips.json', import.meta.url);
const data = JSON.parse(readFileSync(f, 'utf8'));
data.clips = (data.clips || []).filter((c) => !(c.url || '').includes(id));
data.clips.unshift({ url, title, date: new Date().toISOString().slice(0, 10), ...(pin ? { pin: true } : {}) });
writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
console.log(`added ${id}${pin ? ' (pinned)' : ''}`);
execFileSync(process.execPath, [new URL('./update-feed.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], { stdio: 'inherit' });
