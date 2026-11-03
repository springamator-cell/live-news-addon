// Temporary: prints what a /live page looks like around its live markers.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1; SOCS=CAI'
};
for (const path of ['@SkyNews', 'channel/UCExxWMXIf8UR5xb4eQTdh7A', '@LiveNOWFOX']) {
  const res = await fetch(`https://www.youtube.com/${path}/live`, { headers: HEADERS });
  const html = await res.text();
  console.log(`\n===== ${path}  status=${res.status} final=${res.url} len=${html.length}`);
  for (const k of ['videoDetails', 'ytInitialPlayerResponse', 'ytInitialData', '"isLive":true', 'isLiveNow', 'liveBroadcastDetails', 'LIVE_STREAM_OFFLINE', '"style":"LIVE"', 'BADGE_STYLE_TYPE_LIVE_NOW', 'og:type']) {
    console.log(`  ${k}: ${html.split(k).length - 1}`);
  }
  const show = (k, n = 2) => {
    let i = -1;
    for (let c = 0; c < n; c++) {
      i = html.indexOf(k, i + 1);
      if (i < 0) break;
      console.log(`  --- ${k} #${c}: ${html.slice(Math.max(0, i - 400), i + 200).replace(/\s+/g, ' ')}`);
    }
  };
  show('"isLive":true');
  show('og:type', 1);
  show('liveBroadcastDetails', 1);
}
