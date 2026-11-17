#!/usr/bin/env node
// Usage: node tools/add-drop.mjs "Headline" "One or two lines" [Official|Reported|Expected|Crew] [source link]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [title, body = '', label = 'Crew', link = ''] = process.argv.slice(2);
if (!title) { console.log('Usage: node tools/add-drop.mjs "Headline" "One or two lines" [Official|Reported|Expected|Crew] [link]'); process.exit(1); }
if (!['Official', 'Reported', 'Expected', 'Crew'].includes(label)) { console.log('Label must be Official, Reported, Expected or Crew.'); process.exit(1); }
if (label !== 'Crew' && !link) { console.log(`A ${label} drop needs a source link.`); process.exit(1); }
const f = new URL('../content/drops.json', import.meta.url);
const data = JSON.parse(readFileSync(f, 'utf8'));
data.drops = [{ date: new Date().toISOString().slice(0, 10), title, body, label, link }, ...(data.drops || [])];
writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
console.log('drop added');
execFileSync(process.execPath, [new URL('./update-feed.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], { stdio: 'inherit' });
