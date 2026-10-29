// A launch clip for the posts: the page at rest, a click on the first block, the whole run, and the
// sign landing. Each frame is the 3D canvas with the caption drawn over it (the caption is HTML, so a
// canvas-only recording would miss it), recorded with MediaRecorder.
//   node qa/demo.mjs   → media/demo-raw.mp4 (then: avconvert -s media/demo-raw.mp4 -o media/demo.mp4 -p PresetHighestQuality)
import { launch, sleep } from './chrome.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 1280, H = 720, DPR = 1.5;
const page = await launch({ width: W, height: H });
await page.size(W, H, { dpr: DPR });
await page.goto('/', { settle: 400 });
await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
await page.run(() => document.fonts.ready);
await sleep(1500);

await page.run((DPR) => {
  const gl = document.getElementById('scene');
  const out = document.createElement('canvas');
  out.width = gl.width; out.height = gl.height;
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
  const draw = () => {
    g.drawImage(gl, 0, 0);
    const ft = document.getElementById('floorText');
    if (ft.classList.contains('on')) {
      // the floor hint is a transformed element: draw it with the same matrix
      const m = new DOMMatrix(css(ft).transform);
      g.save(); g.scale(k, k);
      g.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]).multiply(new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])));
      g.globalAlpha = +css(ft).opacity;
      [...ft.children].forEach((d) => { const s = css(d); g.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; g.fillStyle = s.color; g.textAlign = 'center'; g.textBaseline = 'top'; g.letterSpacing = s.letterSpacing; g.fillText(d.innerText, ft.offsetWidth / 2, d.offsetTop); });
      g.restore(); g.globalAlpha = 1;
    }
    text(document.querySelector('h1'));
    text(document.getElementById('sub'));
    pill(document.getElementById('home'));
    pill(document.getElementById('reset'));
    text(document.getElementById('sound'));
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  const rec = new MediaRecorder(out.captureStream(60), { mimeType: 'video/mp4;codecs=avc1.640028', videoBitsPerSecond: 8e6 });
  window.__chunks = []; rec.ondataavailable = (e) => window.__chunks.push(e.data); rec.start(250); window.__rec = rec;
}, DPR);

await sleep(2200);                                            // rest: blobs drift, the first block rocks
const start = await page.run(() => Domino.screen(Domino.START));
await page.move(start[0] + 120, start[1] - 60);
await page.move(start[0], start[1], { from: [start[0] + 120, start[1] - 60], steps: 30, ms: 16 });
await sleep(450);                                             // hover lift
await page.click(start.map(Math.round));                     // push
await page.until(() => Domino.state().arrived, { timeout: 30000, what: 'arrived' });
await sleep(2600);                                            // the sign lands face up
const n = await page.run(() => new Promise((res) => { window.__rec.onstop = () => { window.__blob = new Blob(window.__chunks, { type: 'video/mp4' }); res(window.__blob.size); }; window.__rec.stop(); }));
const parts = [];
for (let o = 0; o < n; o += 3e6) {
  parts.push(Buffer.from(await page.run(async (o) => { const buf = new Uint8Array(await window.__blob.slice(o, o + 3e6).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); }, o), 'base64'));
}
const dir = fileURLToPath(new URL('../media/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(dir + 'demo-raw.mp4', Buffer.concat(parts));
console.log('wrote media/demo-raw.mp4', (n / 1e6).toFixed(1), 'MB', page.errors.length ? page.errors : 'no errors');
await page.close();
