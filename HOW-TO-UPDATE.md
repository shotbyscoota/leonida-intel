# Leonida Intel: how updates work

## On its own (no one at the keyboard)
Every 30 minutes `tools/update-feed.mjs` pulls:
- **Your YouTube channel** (SX Exclusive, @SXExclusive). Anything you upload shows up in SX TV.
- **Rockstar's YouTube channel**, GTA VI videos only. They show up under "Official drops" and the hero's trailer button.
- **GTA 6 headlines** from Google News. They feed the yellow tape in the hero and The Wire.

It writes `dist/data/feed.js`. If one source fails, the page keeps its last good items.
Once the site is on GitHub, `.github/workflows/update.yml` runs this every 30 minutes and republishes. Nothing to pay, no keys.

## By hand (one line each, from this folder)
- Add a clip (any channel, Shorts too), newest first:
  `node tools/add-clip.mjs https://youtu.be/VIDEO_ID "Title"`
- Pin a clip to the big screen: add `--pin` to the line above.
- Post a drop to The Wire:
  `node tools/add-drop.mjs "Headline" "One or two lines" Reported https://source.link`
  Labels: Official (Rockstar or a console maker said it), Reported (a named outlet), Expected (not confirmed), Crew (your own take, no link needed).
- Refresh everything now: `node tools/update-feed.mjs`
Then push to GitHub (or wait for the next 30-minute run if you edited on GitHub directly).

## Settings
`content/config.json`: which channels, the news search words, sources to skip, how many clips to show.
