# Leonida Intel: design notes (rebuild, 2026-11-17)

## Brief
- Subject: Leonida Intel, an unofficial GTA VI fan site run by the owner (ShotByScoota).
- Audience: players in the 48 hours before launch, then on launch night.
- Job: be the one clean page people keep open for launch week: when it unlocks for them, what to do before, and what is true. Then grow into the guide hub.
- Constraint: one static `dist/index.html` on the existing OpenAI static hosting (`.openai/hosting.json`). No build step, no backend.
- Facts checked 2026-11-17 (sources in the page footer). GTA VI: Thursday 19 November 2026, midnight local time, PS5 and Xbox Series X|S.

## What the field looks like (checked 2026-11-17)
About ten fan sites (State of Leonida, Leonida Interactive, LeonidaX, Leonida State, The Leonida Map, gta-6-map.org, Mapheist...). Almost all are map-first, built on the same community mapping data, crowded, and their home pages show empty counters ("—d —h"), zero states and links to "#". None of them is about launch night, and none labels where each fact came from.

## Concepts
| # | Territory | Idea | Signature | Anchor | Orig | Fit | Feas | Portab. (low=good) |
|---|---|---|---|---|---|---|---|---|
| A | Place/time | Midnight is moving toward Leonida | A live world band: the real midnight line sweeps west across the cities; each city unlocks as midnight reaches it on 19 Nov | Rockstar's launch is midnight **local** time, so the release literally rolls around the planet | 5 | 5 | 4 | 1 |
| B | Name ("Intel") | A police scanner tuned to the signal | A dial that retunes the feed between Official / Reported / Rumor channels | "Intel" and the owner's "signal, not noise" line | 4 | 4 | 4 | 3 |
| C | Culture | A Leonida tourist postcard | Postcard flips per region | Leonida's state-tourism look | 2 | 3 | 5 | 5 (every GTA site does sunset pink) |

Chosen: **A**, because it is true only this week and only for this game, and B's source labels fold into it as the fact system.

## Concept card
```
Idea:        Midnight is crossing the world toward Leonida, and this page shows you exactly where it is and when it reaches you.
Metaphor:    A world clock at an airport, rebuilt as a night-time signal desk.
Signature:   The Midnight Band: cities placed by time zone; a sodium-orange line marks where it is midnight right now and moves in real time; on 19 Nov every city it passes turns Vice pink ("unlocked"). Your own zone is pinned on the band.
Emotion:     The calm hum before a launch at night: precise, a little electric.
Motion verb: sweep, like the midnight line (left to right, linear-ish, never bouncy).
Screenshot:  Hero: huge countdown to *your* midnight above the band, the orange line cutting through the cities.
```

## System
- Palette: ground `#07070a` (night), ink `#f3efe6` (bone), muted `#9a9ca6`, line `#26262e`, sodium `#ffae42` (the midnight line, focus, hovers), unlock `#ff4d8d` (unlocked cities, Official label). No purple/blue gradients, no glass.
- Type: Space Grotesk 500/700 (display, numerals, labels; tabular figures) + DM Sans 400/500 (body). Self-hosted woff2 from the factory's vendored fonts (open licence).
- Scale: display clamp(3rem, 8.5vw, 8.75rem), tracking -0.045em, leading 0.9; countdown numerals clamp(3.5rem, 11vw, 10rem); body 17px/1.55.
- Grid: 12 columns, 24px gutter, max 1440px, 5vw side margin. Left edge of all text on column 1; facts table uses columns 1-3 (label) / 4-12.
- Shape: radius 0 everywhere, except pills (source labels) at 999px.
- Motion: one clock (a single requestAnimationFrame loop in `clock()`); hovers sweep a sodium bar or fill from the left (transform: scaleX), 260ms, cubic-bezier(.2,.7,.2,1). Idle: the midnight line glows on a 4s breath and the countdown ticks; the line itself moves at the true speed of midnight.
- Reduced motion: no breath, no sweeps (instant state), everything visible.

## Sections (each a different layout family)
1. Header: brand left, anchor nav right, menu panel on phones (Escape closes, focus trapped).
2. Hero: split statement + countdown (asymmetric), then the full-bleed Midnight Band (vertical on phones).
3. Launch facts: ledger table with source pills.
4. Prep: sticky statement left, checklist right (saved in the browser).
5. Leonida: typographic index of the six official regions.
6. Trailers: dated rail; Trailer 1 and 2 play in place on request (no YouTube until clicked).
7. How we label: four labels defined in one line each.
8. Crew: one strong line + Discord slot (placeholder).
9. Footer: disclaimer, sources with dates.

## Genericness test
A generic model lands on "neon command center with cards and a countdown" (that was version 3). Changed: no cards, no glass, no cyan; the countdown is tied to the visitor's own time zone and the band is real time, so the page is different for every visitor and every hour.

## Placeholders (owner must replace)
- Discord invite (crew section).
- Production URL (canonical, OG url, sitemap) once the hosted address is known.

---

# Version 2 (2026-11-17, same day): "The world unlocks at midnight"

Owner's verdict on version 1: "a good basis but everything kind of seems very 2016. What we really want is some 2040... integrative, interactive, very futuristic... GTA 6 is all about personality, style, function and flow."

Owner taste on record (memory): rejects flat dark pages, cream serif, card rows ("2015", "Wix"); responds to "super HD orbs and lines", real data made tangible, floating type, film-like flow (Jarvis Entity concept).

## Concept v2
```
Idea:        A live particle planet where midnight burns across the world toward Leonida; you can drag the planet, drag time through launch night, and watch the world fold into Leonida.
Signature:   (1) real-time midnight line on a ~49k-particle Earth (real sun position, real time zones); (2) a launch-night timeline you scrub, cities igniting pink with a chime; (3) scroll morph: every land particle flies into the real Florida outline (Leonida), region pins appear.
Emotion:     launch-night electricity; a 2040 instrument, not a web page.
Motion verb: sweep (light sweeps through buttons; midnight sweeps the planet).
```
- Renderer: raw WebGL (no library), one shader, additive points; `app.js` + `data/world.js` (Natural Earth, public domain, generated by `make_world_data.py` from 50m land + Florida from admin-1). Works from file:// (classic scripts, no fetch).
- One clock: requestAnimationFrame drives planet, HUD, pins, morph; scenes per section (`data-scene`) with a camera that holds through tall chapters.
- Palette: void #050409, ink #f5f1ff, pink #ff2e88, orange #ff8f3d, cyan #4df3ff (GTA VI sunset, used with conviction). Type: Syne 800 (wide display), Space Grotesk (HUD), DM Sans (body).
- Sound: generated pad + chimes, off by default.
- Honesty: pins are fan placements; the shape is real Florida, not the game map; particles' unlock colouring uses solar longitude (pins use real time zones).
- Version 1 is saved as scratchpad `index-midnight-v1.html` (and in git history for ChatGPT's v3).

---

# Version 3 (2026-11-17): immersion + reasons to share

Owner: "we need to excel harder... as soon as they go to this site, they are immersed... everyone needs this link so they understand how to do everything before they even know they want to do it."

Research that shaped it: Rockstar's own GTA VI page gives the date with no time or countdown (rockstargames.com/VI, read 2026-11-17) -> line "Rockstar gives you the date. This gives you the minute."; 2026 three.js leaders commit to one object with weight, scroll as scenes, a sound layer, hidden gestures (utsubo.com, secondhand); useful + high-arousal positive content is shared more (Berger & Milkman, Wharton). Vault Craft lab 09/11/03: scenes, recurring device, things crossing edges, "the choosing is an object", one interaction people tell a friend about.

Added:
- Entrance: ~49k particles fall in from deep space over 2.6 s while the planet spins into place; starfield (2.6k twinkling stars, parallax with the planet).
- Glow pipeline: scene to a texture, quarter-size blur x2, composite + pink/cyan atmosphere ring around the planet (raw WebGL framebuffers).
- The planet answers the mouse: particles part around the pointer and light up.
- Crew board (#crew): ~55 cities; ranks the crew by unlock; live countdowns; the URL hash (#crew=A|B|C) rebuilds the board for anyone who opens it; crew cities become orange pins on the planet.
- Launch kit (#kit): PS5 / Xbox switch with exact menu paths, a space check against 212 GB, a calendar file (.ics) for your midnight with a 30-minute reminder, progress ring.
- Map data (580 KB) loads after first paint: first load ~290 KB, 15 KB gz JS.

Critic (separate agent, screenshots only): v1 7.25 -> 7.4, v2 7.65, v3 7.6 before polish (Usability, Creativity, Content 8; Design 7 held by seams, pins over footer, a gap, a bare 404); polish pass fixed those.

---

# Version 4 (2026-11-17): Vice City after dark

Owner on v3: "looks sooooo AI generated... more visuals, more loud GTA gangster vibes"; wants their own YouTube clips and automatic updates. Verdict on the cause: v3 was a tech demo (particle planet, HUD, night signal desk): the look of an AI showcase, not of GTA.

- Art direction: full-bleed night photography (17 Pexels stand-ins of Miami / Florida, one per region or mood), Anton poster caps, Mr Dafoe neon script, DM Sans body; sunset pink-to-orange, sodium yellow, Miami teal on asphalt black; film grain over everything; hard-shadow "sticker" buttons.
- Devices: caution-tape headline ticker (live feed, pause button); wanted-level "Heat" stars that fill as your midnight nears; TV screen with scanlines and channel bug; tabloid front page (The Wire) on bone with pink halftone; police line-up rap sheet for facts; a moving photo strip.
- Sections: hero (countdown to your midnight) / Scoota TV / photo strip / The Wire / Leonida regions (fan readings, labelled) / Rap sheet / The job (prep list, space check, calendar file) / Who gets in first (live rolling-release order) / close / footer.
- Automation: tools/update-feed.mjs (YouTube RSS for the owner's and Rockstar's channels, Google News RSS, content/clips.json, content/drops.json) writes dist/data/feed.js; .github/workflows/update.yml runs it every 30 min and publishes to GitHub Pages. See HOW-TO-UPDATE.md.
- Removed from the page: the WebGL planet (app.js and data/world.js stay on disk, unused).
