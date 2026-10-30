// A launch clip for the posts: the page at rest, a click on the first block, the whole run, and the
// sign landing. Each frame is the 3D canvas with the caption drawn over it (the caption is HTML, so a
// canvas-only recording would miss it), recorded with MediaRecorder.
//   node qa/demo.mjs && swift qa/mux.swift   → media/demo.mp4 and media/demo-720.mp4
import { launch, sleep } from './chrome.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 1280, H = 720, DPR = 1.5;
const page = await launch({ width: W, height: H });
await page.size(W, H, { dpr: DPR });
// Sound: the page makes its audio context only on the first click, after recording has started,
// so hand it one made now, and copy everything it sends to the speakers into a stream the
// recorder can take.
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const AC = window.AudioContext; let ctx;
  window.__audioCtx = () => ctx || (ctx = new AC());
  window.AudioContext = function () { return window.__audioCtx(); };
  window.AudioContext.prototype = AC.prototype;
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) { const c = this.context; c.__tap = c.__tap || c.createMediaStreamDestination(); connect.call(this, c.__tap); }
    return out;
  };
})();` });
await page.goto('/', { settle: 400 });
await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
await page.run(() => document.fonts.ready);
await sleep(1500);

await page.run((DPR) => {
  const gl = document.getElementById('scene');
  const out = document.createElement('canvas');
  out.width = gl.width; out.height = gl.height;
  // a detached canvas sends no frames to the recorder, so it sits on the page, out of the way
  Object.assign(out.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0.02', pointerEvents: 'none', zIndex: '2147483647' });
  document.body.append(out);
  const g = out.getContext('2d');
  const k = gl.width / innerWidth;
  const css = (el) => getComputedStyle(el);
  const text = (el) => {
    const r = el.getBoundingClientRect(), s = css(el);
    g.font = `${s.fontWeight} ${parseFloat(s.fontSize) * k}px ${s.fontFamily}`;
    g.fillStyle = s.color; g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = s.letterSpacing === 'normal' ? '0px' : `${parseFloat(s.letterSpacing) * k}px`;
    const lines = el.innerText.split('\n');
    lines.forEach((t, i) => g.fillText(t, (r.left + r.width / 2) * k, (r.top + r.height * (i + 0.5) / lines.length) * k));
  };
  const pill = (el) => {
    if (el.hidden) return;
    const r = el.getBoundingClientRect(), s = css(el);
    const op = el.getAnimations().length ? 0.0 + Math.min(1, el.getAnimations()[0].currentTime / 420) : 1;
    g.globalAlpha = op;
    g.beginPath(); g.roundRect(r.left * k, r.top * k, r.width * k, r.height * k, r.height * k / 2);
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') { g.fillStyle = s.backgroundColor; g.fill(); }
    g.strokeStyle = s.borderTopColor; g.lineWidth = k; g.stroke();
    text(el); g.globalAlpha = 1;
  };
  // the page's CSS background, painted the same way: ivory, then each radial layer (CSS lists the
  // top layer first, so paint them in reverse)
  const layers = [
    [0.5, 1, 0.66, 0.56, '207, 208, 231', [[0, .57], [.2, .42], [.42, .24], [.64, .09], [.84, .02], [1, 0]]],
    [0, 1, 0.78, 0.78, '201, 220, 196', [[0, .55], [.2, .4], [.42, .23], [.64, .09], [.84, .02], [1, 0]]],
    [1, 0, 0.85, 0.8, '235, 201, 198', [[0, .8], [.18, .62], [.38, .38], [.58, .17], [.78, .05], [1, 0]]],
  ];
  const background = () => {
    g.fillStyle = '#F4EBDD'; g.fillRect(0, 0, out.width, out.height);
    for (const [cx, cy, rx, ry, rgb, stops] of layers) {
      g.save(); g.translate(cx * out.width, cy * out.height); g.scale(rx * out.width, ry * out.height);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [o, a] of stops) gr.addColorStop(o, `rgba(${rgb}, ${a})`);
      g.fillStyle = gr; g.fillRect(-2, -2, 4, 4); g.restore();
    }
  };
  window.__draws = 0;
  const draw = () => { try { drawFrame(); window.__draws++; } catch (e) { window.__err = String(e.stack || e); } requestAnimationFrame(draw); };
  const drawFrame = () => {
    background();
    g.drawImage(gl, 0, 0);
    const ft = document.getElementById('floorText');
    if (ft.classList.contains('on') && +css(ft).opacity > 0.01) {
      // the floor hint, flat at its place on screen
      const r = ft.getBoundingClientRect(), rows = [...ft.children];
      g.globalAlpha = +css(ft).opacity;
      rows.forEach((d, i) => { const s = css(ft); g.font = `500 ${(r.height / rows.length) * 0.78 * k}px ${s.fontFamily}`; g.fillStyle = s.color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = `${(r.height / rows.length) * 0.08 * k}px`; g.fillText(d.innerText.toUpperCase(), (r.left + r.width / 2) * k, (r.top + r.height * (i + 0.5) / rows.length) * k); });
      g.globalAlpha = 1;
    }
    text(document.querySelector('h1'));
    text(document.getElementById('sub'));
    pill(document.getElementById('home'));
    pill(document.getElementById('reset'));
    text(document.getElementById('sound'));
  };
  requestAnimationFrame(draw);
  const ctx = window.__audioCtx();
  ctx.__tap = ctx.__tap || ctx.createMediaStreamDestination();
  // picture and sound go to two recorders started together (one recorder doing both kept writing
  // video that would not open); qa/mux.swift joins them afterwards
  const recs = window.__recs = {
    video: new MediaRecorder(out.captureStream(60), { mimeType: 'video/mp4;codecs=avc1.640028', videoBitsPerSecond: 8e6 }),
    audio: new MediaRecorder(ctx.__tap.stream, { mimeType: 'audio/mp4;codecs=mp4a.40.2', audioBitsPerSecond: 192000 }),
  };
  window.__chunks = { video: [], audio: [] };
  for (const [k, r] of Object.entries(recs)) { r.ondataavailable = (e) => window.__chunks[k].push(e.data); }
  for (const r of Object.values(recs)) r.start(250);
  window.__recStart = performance.now();
}, DPR);

await sleep(2200);                                            // rest: blobs drift, the first block rocks
const start = await page.run(() => Domino.screen(Domino.START));
await page.move(start[0] + 120, start[1] - 60);
await page.move(start[0], start[1], { from: [start[0] + 120, start[1] - 60], steps: 30, ms: 16 });
await sleep(450);                                             // hover lift
await page.click(start.map(Math.round));                     // push
await page.until(() => Domino.state().arrived, { timeout: 30000, what: 'arrived' });
await sleep(2600);                                            // the sign lands face up
await page.run(() => Promise.all(Object.entries(window.__recs).map(([k, r]) => new Promise((res) => { r.onstop = () => { window['__blob_' + k] = new Blob(window.__chunks[k]); res(); }; r.stop(); }))));
const dir = fileURLToPath(new URL('../media/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const [k, file] of [['video', 'demo-video.mp4'], ['audio', 'demo-audio.m4a']]) {
  const n = await page.run((k) => window['__blob_' + k].size, k);
  const parts = [];
  for (let o = 0; o < n; o += 3e6) {
    parts.push(Buffer.from(await page.run(async (k, o) => { const buf = new Uint8Array(await window['__blob_' + k].slice(o, o + 3e6).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); }, k, o), 'base64'));
  }
  writeFileSync(dir + file, Buffer.concat(parts));
  console.log('wrote media/' + file, (n / 1e6).toFixed(1), 'MB');
}
// where the thud falls in the picture, for qa/mux.swift to line the sound up on
const thud = await page.run(() => (Domino.thudAt() - window.__recStart) / 1000);
writeFileSync(dir + 'demo-sync.json', JSON.stringify({ thud }));
console.log('thud at', thud.toFixed(2), 's into the picture');
console.log(page.errors.length ? page.errors : 'no errors');
await page.close();
