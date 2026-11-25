# SX Exclusive: one GTA VI Short a day

How to make one original GTA VI Short a day without filming every day: record 7 in one session, edit in one session, post one a day after you approve each one.

**Rules that never bend**
- Only our own gameplay, recorded on our console. Never re-upload, crop or "react" to another creator's clip as if it were ours. Their discovery gets credited by name in the caption.
- A claim on screen carries its label: **Official** (Rockstar said it), **Tested** (we did it on camera, version shown), **Reported** (an outlet said it; name it), **Unverified** (a lead). No "100% working" unless we just did it on the latest update.
- Cheats and glitches: make a manual save first, never on the main story save. Note whether the cheat blocked saving and trophies.
- Nothing goes public until Scoota has watched the finished clip and said yes. Upload as **Private** (YouTube Studio › Visibility › Private), then switch to Public or schedule it after approval. Never rely on a default visibility.

## The weekly loop (about 4 hours a week)

| When | What | Time |
|---|---|---|
| Sunday | Open the week's queue file (`creator/queue-*.md`). Check the intel board for new patches; swap out any clip a patch made outdated. | 15 min |
| Sunday | **Batch record** all 7 clips, in the order of `shotlist-batch.md` (grouped by place in the map, so you travel once). | 2 h |
| Monday | **Batch edit** all 7 with the editing checklist below. Export 1080×1920. | 1.5 h |
| Monday | Upload all 7 to YouTube as **Private**, with title, caption and sources pasted from the queue. | 20 min |
| Daily | Watch that day's clip, say yes, set it Public. Reply to comments; good questions go into next week's queue. | 10 min |

## Where clips go on the site

The site scans the SX Exclusive channel every 30 minutes. A video shows on **SX TV** when its title has **GTA 6**, **GTA VI** or **#GTA6** in it (`content/config.json` › `yourChannel.onlyIfTitleHas`). Private videos never show; they appear once they are public.

The site republishes new videos within about 3 hours. To put one up front right away, pin it:
```
node tools/add-clip.mjs https://youtube.com/shorts/VIDEOID "Title" --pin
git add content/clips.json && git commit -m "Pin SX clip" && git push
```

If a clip proves a cheat or glitch, add it to `content/intel.json` as **Tested**, with the `tested` block (date, version, platform), the `cheat` block (exact input, unlock condition, whether it blocked saves and trophies) or the `glitch` block (`reproducesOnLatest` true/false), and the video link as `url`. Run `node tools/update-feed.mjs --check`: it refuses Tested without the proof.

## File naming (keeps a week of footage findable)

```
footage/2026-W48/raw/   C01-patch-take1.mp4  C03-firstperson-take2.mp4 ...
footage/2026-W48/edit/  C01-patch-final.mp4
footage/2026-W48/proof/ C03-version-screen.png   (screenshot of the version number before every test)
```
Footage stays out of git (it is in `.gitignore`); back it up to OneDrive or an external drive.

## Editing checklist (every clip)

1. Hook in the first 1.5 s: on-screen text + the moment itself, no intro.
2. 9:16, 1080×1920, 30–60 s. Captions burned in (big, high contrast, inside the safe zone: not the bottom 20%, not the right 15%).
3. The label on screen when a claim is made: `TESTED v1.002.002 PS5` or `REPORTED · Polygon`.
4. The version number shown once (the console's Information screen) for any cheat, glitch or patch clip.
5. No other creator's footage. No copyrighted music beyond in-game audio and YouTube's own library.
6. End card: one line + "Full list on the site" (link in bio / pinned comment).
7. Title has **GTA 6** in it (so the site picks it up). Under 60 characters.
8. Caption: what it is, label, source links, credit to whoever found it first, `#GTA6 #GTAVI #Shorts`.
9. Upload as **Private**. Scoota approves the watched final; only then Public.
