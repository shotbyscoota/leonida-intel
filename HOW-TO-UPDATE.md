# Leonida Intel: how updates work (post-launch, v5)

## On its own (no one at the keyboard)
Every 30 minutes GitHub Actions (`.github/workflows/update.yml`) runs `tools/update-feed.mjs`, which reads:
- **Rockstar's own pages** (Newswire and Support, via Google News `site:` searches) → **Official**.
- **Gaming outlets' own RSS**: GameSpot, IGN, Eurogamer, PC Gamer, VGC, Push Square, Pure Xbox → **Reported**.
- **Topic searches** (patches, cheats, glitches, secrets) on Google News → **Reported** if the publisher is on the trusted list in `content/config.json`, otherwise **Unverified**.
- **Your YouTube channel** (SX Exclusive), GTA VI titles only (title must contain GTA 6 / GTA VI / #GTA6) → SX TV.
- **Rockstar's YouTube channel**, GTA VI videos only → "Official drops" and the trailer buttons.
- **GTA 6 headlines** → the yellow tape and The Wire.

Every finding is kept in a ledger (`data/scan-state.json`) with its first-seen and last-checked time, publisher, source link, platform and version when the headline says so. The same story is never listed twice (same link, same video, or same headline). A source that fails keeps everything it found before.

**Publishing:** a new Official Rockstar item goes out on the next scan. Other new findings go out at most every 3 hours, plus a 12-hour heartbeat (`content/config.json` › `publish`). Each publish is one commit of `dist/data/feed.js`, and Netlify deploys that commit to https://gtadropz.netlify.app. Fewer deploys = fewer Netlify credits.

Reddit is switched off: since November 2026 its RSS needs a login. It can come back only through a Reddit API app (OAuth), never by scraping around the login.

## The labels (never bend these)
- **Official**: Rockstar's own page says it.
- **Tested**: we did it on camera; the record has the date, game version and platform (and for a cheat: exact input, unlock condition, whether it blocked saves and trophies; for a glitch: whether it still works on the latest update).
- **Reported**: a named outlet said it.
- **Patched**: a glitch that no longer reproduces on the latest update.
- **Unverified**: a lead. Shown under "Street leads", never as fact.

## By hand (one line each, from this folder)
- Add a checked fact, a tested cheat or a re-tested glitch: edit `content/intel.json` (an example of a Tested cheat is at the top), then `node tools/update-feed.mjs --check`. It refuses Tested without the proof fields.
- New title update: add a row to `content/patches.json` (Official only with Rockstar's own link).
- Pin an SX clip to the big screen: `node tools/add-clip.mjs https://youtube.com/shorts/VIDEO_ID "Title" --pin`
- Post a drop to The Wire: `node tools/add-drop.mjs "Headline" "One or two lines" Reported https://source.link`
- Publish now: `node tools/update-feed.mjs --force`, or on GitHub: Actions › scan-and-publish › Run workflow › force.
- Run the tests: `node --test tools/test-updater.mjs`

Then commit and push to `main`. Netlify deploys only when something under `dist/` changed.

## The map (map.html)
Built for years of small edits, with no libraries and no build step for the page itself.
- **Places live in one file:** `content/map/places.json`. Copy an existing entry, change it, then run `node tools/build-map.mjs` (writes `dist/data/map.js`) and commit both files. `node tools/build-map.mjs --check` validates without writing; GitHub runs it on every scan and fails loudly if a rule is broken or the data file is stale.
- **Rules the builder enforces:** every place needs at least one source link; `pos` is `[x, y]` in Open GTA 6 Map units (0 to 1024 across the map, y grows south; 1 unit = 32 m in game), or `null` when no guide says where (it then shows under "Not placed yet"); `precision` is `mapped` (the community map data has this exact thing; `mapRef` names the record), `near` (pinned at the named landmark right beside it; `mapRef`), `area` (only the town/district is known), `region` (only the region) or `spot` (only when Tested by us or placed by Rockstar); `more` lists extra exact points of the same entry (wrecks, labs, parts), numbered on the map when the card is open; Tested needs `checked.on`, `checked.version`, `checked.platform` (and `checked.clip` for the SX video that proves it).
- **When Rockstar ships an update**, add it to `content/patches.json`: every map card read before that date shows "read before update X; check in game" until someone re-checks it.
- **Finding positions:** search the Open GTA 6 Map data (`https://fbritoferreira.github.io/gta6/data/locations.json` and `places.json`) for the thing itself. When one record is clearly the same thing (same name, same district, the description agrees with our source), copy its `x`, `y` into `pos`, set `precision: "mapped"` and `mapRef: { "id": ..., "name": ... }`. If it only matches a landmark next to it, use `near`. If the data and our source disagree about where it is, keep `area` and say so in the steps. Never guess an exact point.
- **The map itself (coast, water, roads, buildings):** `content/map/leonida.json`, made by `tools/map/import-leonida.py` from the Open GTA 6 Map data (CC BY 4.0; the usage line at the top of that script fetches it pinned to one commit; needs `pip install shapely`). Re-run it when that project improves its map, then `node tools/build-map.mjs`. Keep the credit line on the map and in the footer (the licence requires it).
- **Tests:** `node --test tools/test-map.mjs` (20 with the updater tests).

- **3D and 2D:** the map opens in 3D (tilted, buildings standing); the 3D/2D buttons (or V) switch to a flat north-up view and the choice is remembered on that device. Building heights are illustrative by district (the data has none), which the credit line and the "How the map is made" section say.
- **Research batches:** new spots go in `content/map/places.json` with a source each. Pin them from the open map data as above; never `spot` unless we stood there in game.
- **The editor's check:** `node tools/audit-map.mjs` catches what the builder lets through: text cut off at a length cap, broken characters, two cards for the same spot, a pin far from its region or out at sea, and a label that disagrees with its sources. Add `--links` to open every source link (slow). GitHub runs it on every scan. It must say `0 error(s), 0 warning(s)`.
- **Before adding a spot, search for it first** (on the List page or in places.json). If it is already there, add your source and any new steps to that card instead of making a second one. Two things in the same building go next to each other on the map.
- **When a label is lower than its best source** (an outlet confirms the item but only fan guides say where), keep the lower label and add `"statusNote"`: one sentence saying why. It shows on the card.
- **The List page** (`spots.html`) and the intel board's Map spots tab read the same `dist/data/map.js`, so every spot appears on the map, the list and the board automatically. The board's three examples per category are the `FEATURED` list at the top of the map-spots block in `dist/site.js`; a test fails if one of them is deleted.

## The How-to page (howto.html)
29 guides to the things GTA VI never explains, in six topics. Each guide is plain HTML in `dist/howto.html` (no build step), so search engines and people without JavaScript see all of it. `dist/howto.js` only adds the search box, topic chips, shared links and Copy link.
- **Add a guide:** copy one `<li id="...">` block inside the right `<section class="group">`, give it a new short `id` (that becomes its share link, `howto.html#your-id`), and update the number in that section's `<small>` heading and the "29 guides" count in the filter bar.
- **Every step needs a source you have read.** Link the outlet's own article (not a Google News link), with the date it was published. Label it Reported. Tested is only for something we did on camera (date, game version, platform).
- **Sites that block robots** (GameSpot, IGN, Rockstar Support) can't be checked automatically, so don't use them as a guide's only source.
- **After a game update,** change the "Checked" date and "Game update" stamp at the top, and re-read any guide the patch notes touch.
- **Before every deploy:** `node tools/check-links.mjs --external`. It opens every link on every page and must end with `no broken links`. Anything marked BLOCKED refuses robots; open it in a browser to confirm.

## Daily Shorts
See `creator/README.md` (the weekly batch loop) and `creator/queue-*.md` (this week's 7 clips).

## Settings
`content/config.json`: channels and title filters, research sources, trusted publishers, how many findings per category, publish throttle.
