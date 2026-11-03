// Builds the Live News addon as static files in dist/.
// For each channel in channels.json it checks the official YouTube channel for a
// live stream and its latest uploads (from YouTube's public RSS feed).
// GitHub Actions runs this on a schedule and publishes dist/ to GitHub Pages.

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'dist';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const CLIPS = 6;
const CACHE_SECONDS = 300;
const ID_PREFIX = 'lnews-';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1; SOCS=CAI'
};

const config = JSON.parse(await readFile('channels.json', 'utf8'));

async function get(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      if (attempt >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function metaTag(html, attr, name) {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

function findChannelId(html) {
  const patterns = [
    /"externalId":"(UC[\w-]{22})"/,
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /"channelId":"(UC[\w-]{22})"/
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function parseFeed(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((e) => ({
    id: (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1],
    title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
    published: (e.match(/<published>([^<]+)<\/published>/) || [])[1]
  })).filter((v) => v.id);
}

// A channel's /live page shows its current live stream. It counts as live when the main
// video is marked live with people watching (scheduled streams show "waiting" and an
// offline status instead) and the video's owner is this channel.
function findLive(html, channelId) {
  if (html.includes('LIVE_STREAM_OFFLINE')) return null;
  const at = html.indexOf('{"videoPrimaryInfoRenderer":');
  if (at < 0) return null;
  const info = html.slice(at, at + 3000);
  if (!info.includes('"isLive":true') || !info.includes('watching')) return null;
  if (!html.slice(at, at + 40000).includes(`"${channelId}"`)) return null;

  const ep = html.match(/"currentVideoEndpoint":\{[\s\S]{0,800}?"watchEndpoint":\{"videoId":"([\w-]{11})"/);
  if (!ep) return null;

  const t = info.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
  let title = null;
  try { title = t ? JSON.parse(`"${t[1]}"`) : null; } catch { title = null; }
  return { id: ep[1], title: title || 'Live now' };
}

const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short'
  });
}

async function resolve(channel) {
  const base = channel.channelId
    ? `https://www.youtube.com/channel/${channel.channelId}`
    : `https://www.youtube.com/${channel.handle}`;

  const page = await get(base);
  const channelId = channel.channelId || findChannelId(page);
  if (!channelId) throw new Error('could not find the YouTube channel ID');
  const avatar = metaTag(page, 'property', 'og:image');

  const livePage = await get(`${base}/live`);
  const live = findLive(livePage, channelId);

  let clips;
  try {
    const feed = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    clips = parseFeed(feed)
      .filter((v) => !live || v.id !== live.id)
      .slice(0, CLIPS)
      .map((v) => ({ ytId: v.id, name: channel.name, title: `${v.title}\n${shortDate(v.published)}` }));
  } catch (e) {
    // YouTube's feed fails now and then; reuse the clips from the last published update.
    clips = (await previousClips(ID_PREFIX + channel.id)).filter((s) => !live || s.ytId !== live.id);
    console.warn(`  ${channel.name}: feed unavailable (${e.message}); reused ${clips.length} earlier clips`);
  }

  return { channelId, avatar, live, clips, url: base };
}

async function previousClips(id) {
  if (!BASE_URL) return [];
  try {
    const data = JSON.parse(await get(`${BASE_URL}/stream/tv/${id}.json`, 1));
    return (data.streams || []).filter((s) => s.ytId && s.name !== '🔴 LIVE');
  } catch {
    return [];
  }
}

async function write(file, data) {
  const full = path.join(OUT, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, typeof data === 'string' ? data : JSON.stringify(data));
}

await rm(OUT, { recursive: true, force: true });

const results = [];
for (const channel of config.channels) {
  try {
    const r = await resolve(channel);
    results.push({ channel, ...r });
    console.log(`${r.live ? 'LIVE   ' : 'offline'}  ${channel.name}  (${r.clips.length} clips)`);
  } catch (e) {
    results.push({ channel, error: e.message });
    console.log(`ERROR    ${channel.name}: ${e.message}`);
  }
}

const usable = results.filter((r) => !r.error && (r.live || r.clips.length));
usable.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));

const metas = [];
for (const r of usable) {
  const { channel, live, clips, avatar } = r;
  const id = ID_PREFIX + channel.id;
  const backdropId = live ? live.id : clips[0]?.ytId;
  const meta = {
    id,
    type: 'tv',
    name: channel.name,
    poster: avatar || (backdropId ? thumb(backdropId) : undefined),
    posterShape: 'square',
    logo: avatar || undefined,
    background: backdropId ? thumb(backdropId) : undefined,
    genres: [channel.group],
    releaseInfo: live ? '🔴 LIVE' : 'Recent videos',
    description: live
      ? `🔴 Live now: ${live.title}`
      : `Not live right now. ${clips.length} recent videos available.`
  };
  metas.push(meta);

  const streams = [];
  if (live) streams.push({ ytId: live.id, name: '🔴 LIVE', title: live.title });
  streams.push(...clips);
  streams.push({
    externalUrl: live ? `https://www.youtube.com/watch?v=${live.id}` : r.url,
    name: 'YouTube',
    title: 'Open in YouTube'
  });

  await write(`meta/tv/${id}.json`, { meta, cacheMaxAge: CACHE_SECONDS });
  await write(`stream/tv/${id}.json`, { streams, cacheMaxAge: CACHE_SECONDS });
}

await write('catalog/tv/live-news.json', { metas, cacheMaxAge: CACHE_SECONDS });
for (const group of config.groups) {
  await write(`catalog/tv/live-news/genre=${group}.json`, {
    metas: metas.filter((m) => m.genres.includes(group)),
    cacheMaxAge: CACHE_SECONDS
  });
}

const manifest = {
  id: 'community.springamator.livenews',
  version: '1.0.0',
  name: 'Live News',
  description: 'Free, official live news streams and the latest clips from US, international and local channels.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  idPrefixes: [ID_PREFIX],
  catalogs: [{
    type: 'tv',
    id: 'live-news',
    name: 'Live News',
    extra: [{ name: 'genre', options: config.groups, isRequired: false }]
  }],
  behaviorHints: { configurable: false, configurationRequired: false }
};
await write('manifest.json', manifest);

const updated = new Date().toISOString();
await write('status.json', {
  updated,
  channels: results.map((r) => ({
    name: r.channel.name,
    status: r.error ? 'error' : r.live ? 'live' : (r.clips.length ? 'offline' : 'empty'),
    live: r.live?.title,
    clips: r.clips?.length ?? 0,
    error: r.error
  }))
});

// Install page
const manifestUrl = `${BASE_URL}/manifest.json`;
const stremioUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rows = results.map((r) => {
  const state = r.error ? '⚠️ unavailable' : r.live ? '🔴 live' : r.clips.length ? 'recent videos' : 'nothing yet';
  return `<li><span>${esc(r.channel.name)}</span><span class="s">${state}</span></li>`;
}).join('');

await write('index.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live News Addon</title>
<style>
:root{color-scheme:light dark;--bg:#0d1015;--fg:#eef1f6;--mut:#9aa3b2;--acc:#8ab4f8;--card:#171b23}
@media (prefers-color-scheme: light){:root{--bg:#f6f7f9;--fg:#11151c;--mut:#5b6472;--card:#fff;--acc:#1a5fd1}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:32px 16px}
h1{margin:0 0 4px;font-size:28px}p{color:var(--mut);margin:0 0 20px}
a.btn{display:block;text-align:center;background:var(--acc);color:#000;padding:14px;border-radius:12px;font-weight:600;text-decoration:none}
code{display:block;margin:12px 0 24px;padding:12px;border-radius:10px;background:var(--card);word-break:break-all;font-size:13px}
ul{list-style:none;padding:0;margin:0;background:var(--card);border-radius:12px}
li{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border-top:1px solid rgba(127,127,127,.15)}
li:first-child{border-top:0}.s{color:var(--mut);white-space:nowrap}small{display:block;margin-top:16px;color:var(--mut)}
</style></head><body><main>
<h1>Live News</h1>
<p>Free, official live news streams for Stremio and Nuvio.</p>
<a class="btn" href="${esc(stremioUrl)}">Install in Stremio</a>
<code>${esc(manifestUrl)}</code>
<ul>${rows}</ul>
<small>Updated ${esc(updated)} · refreshes about every 30 minutes</small>
</main></body></html>`);

console.log(`\n${metas.length} channels published, ${metas.filter((m) => m.releaseInfo === '🔴 LIVE').length} live.`);
