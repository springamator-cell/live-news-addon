// Temporary: shows the markers findLive relies on for one live channel.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1; SOCS=CAI'
};
const html = await (await fetch('https://www.youtube.com/@SkyNews/live', { headers: HEADERS })).text();
const at = (k) => { const out = []; let i = -1; while ((i = html.indexOf(k, i + 1)) >= 0 && out.length < 5) out.push(i); return out; };
for (const k of ['videoPrimaryInfoRenderer', 'videoDetails', 'UCoMdktPbSTixAyNGwb-UYkQ', 'currentVideoEndpoint', 'watching']) {
  console.log(`${k}: ${JSON.stringify(at(k))}`);
}
const v = html.indexOf('videoDetails');
console.log('around videoDetails: ' + html.slice(v - 60, v + 300).replace(/\s+/g, ' '));
const c = html.indexOf('currentVideoEndpoint');
console.log('around currentVideoEndpoint: ' + html.slice(c, c + 400).replace(/\s+/g, ' '));
const p = html.indexOf('videoPrimaryInfoRenderer');
console.log('around primary: ' + html.slice(p - 40, p + 160).replace(/\s+/g, ' '));
