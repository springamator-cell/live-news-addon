# Live News — a Stremio addon

Free, official live news streams in Stremio (and Stremio-compatible apps like Nuvio).

Every 30 minutes, GitHub checks each channel's **official YouTube channel**: if it's live,
the live stream is listed first; otherwise you get its latest videos. Everything plays through
Stremio's built-in YouTube support. No servers, no accounts, no cost.

## Install

Open the addon's GitHub Pages site (Settings → Pages shows the address) and tap
**Install in Stremio**, or paste the `.../manifest.json` address into Stremio's addon search box.

## Change the channels

Edit `channels.json`. Each channel needs an `id`, a `name`, a `group` (US, International or
Local), and either its YouTube `handle` (like `@SkyNews`) or `channelId` (starts with `UC`).
Commit the change and the addon rebuilds within a couple of minutes.

The `status.json` page on the site shows which channels are live, offline or failing.

## Notes

- Only official channel uploads and live streams are used; nothing is re-hosted.
- GitHub pauses scheduled runs if a repo has no activity for 60 days. If the addon stops
  updating, open Actions → "Update and publish addon" → Run workflow.
