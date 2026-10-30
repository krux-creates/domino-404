// The launch clip: the page at rest, a cursor gliding in to the first block, the push, the whole
// run with its clacks, the sign landing with its thud, and the cursor moving to Back to home.
//
// The picture comes from Chrome's own screencast of the real page (WebGL, text and all), and the
// cursor is a real element on the page that follows the mouse, because headless Chrome draws
// none. The sound is the page's own audio, copied off to a recorder. qa/frames.swift turns the
// frames into a video and qa/mux.swift lays the sound on it, lined up on the thud.
//   node qa/demo.mjs && swift qa/frames.swift && swift qa/mux.swift   → media/demo.mp4, media/demo-720.mp4
//   CURSOR=1 adds a drawn cursor
import { launch, sleep } from './chrome.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 1280, H = 720, DPR = 1.5;
const media = fileURLToPath(new URL('../media/', import.meta.url));
const framesDir = media + 'frames/';
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const page = await launch({ width: W, height: H });
await page.size(W, H, { dpr: DPR });
// Sound: the page makes its audio context only on the first click, so hand it one made at load,
// and copy everything it sends to the speakers into a stream a recorder can take.
await page.beforeLoad(`(() => {
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
})();`);
await page.goto('/', { settle: 400 });
await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
await page.run(() => document.fonts.ready);

// the cursor (CURSOR=1): a standard arrow, a pointing hand over a block or a button, a ring on
// each click. Off by default: the clip shows the page on its own.
if (process.env.CURSOR) await page.run(() => {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="22" height="26" viewBox="-1 -1 15 21" class="arrow"><path d="M0 0 L0 17 L4.2 13.1 L7 19.6 L10 18.3 L7.3 11.9 L12.6 11.9 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg><svg width="26" height="28" viewBox="0 0 20 22" class="hand"><path d="M6 0.8c1 0 1.8 .8 1.8 1.8v6.2c.3-.6 .9-1 1.6-1 1 0 1.8 .8 1.8 1.8v.4c.3-.5 .9-.9 1.6-.9 1 0 1.8 .8 1.8 1.8v.6c.3-.4 .8-.7 1.4-.7 1 0 1.8 .8 1.8 1.8v4.6c0 3.6-2.6 6.4-6.2 6.4H9.9c-1.9 0-3.4-.9-4.4-2.4L1.3 14.6c-.6-.9-.3-2 .6-2.5.8-.5 1.8-.3 2.3.4L4.2 13V2.6C4.2 1.6 5 .8 6 .8z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  Object.assign(el.style, { position: 'fixed', left: '-60px', top: '-60px', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.3))', transition: 'transform .08s', transformOrigin: '0 0' });
  const style = document.createElement('style');
  style.textContent = `.qa-cur svg { position: absolute; left: 0; top: 0; } .qa-cur .hand { display: none; left: -7px; top: -1px; } .qa-cur.pointer .hand { display: block; } .qa-cur.pointer .arrow { display: none; }
    .qa-ring { position: fixed; z-index: 2147483646; pointer-events: none; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; border: 2px solid rgba(31, 27, 22, .45); animation: qa-ring .5s ease-out forwards; }
    @keyframes qa-ring { to { transform: scale(5); opacity: 0; } }`;
  document.head.append(style);
  el.className = 'qa-cur';
  document.body.append(el);
  addEventListener('pointermove', (e) => {
    el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px';
    const over = document.elementFromPoint(e.clientX, e.clientY);
    el.classList.toggle('pointer', document.getElementById('scene').style.cursor === 'pointer' || !!over?.closest?.('a, button'));
  }, true);
  addEventListener('pointerdown', (e) => {
    el.style.transform = 'scale(.9)'; setTimeout(() => { el.style.transform = ''; }, 120);
    const r = document.createElement('div'); r.className = 'qa-ring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    document.body.append(r); setTimeout(() => r.remove(), 600);
  }, true);
});

// start the sound recorder and the screencast together
const frames = [];
let pending = Promise.resolve();
page.on('Page.screencastFrame', (f) => {
  frames.push({ file: `f${String(frames.length).padStart(5, '0')}.jpg`, t: f.metadata.timestamp });
  writeFileSync(framesDir + frames.at(-1).file, Buffer.from(f.data, 'base64'));
  pending = pending.then(() => page.send('Page.screencastFrameAck', { sessionId: f.sessionId })).catch(() => {});
});
await page.run(() => {
  const ctx = window.__audioCtx();
  ctx.__tap = ctx.__tap || ctx.createMediaStreamDestination();
  const rec = window.__rec = new MediaRecorder(ctx.__tap.stream, { mimeType: 'audio/mp4;codecs=mp4a.40.2', audioBitsPerSecond: 192000 });
  window.__chunks = []; rec.ondataavailable = (e) => window.__chunks.push(e.data); rec.start(250);
});
await page.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });

const glide = async (a, b, ms) => { const n = Math.round(ms / 16); for (let i = 1; i <= n; i++) { const e = 1 - (1 - i / n) ** 3; await page.move(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e); await sleep(16); } };
await sleep(1600);                                            // rest: the first block rocks
const start = await page.run(() => Domino.screen(Domino.START));
const from = [W * 0.32, H * 0.86];
await page.move(...from);
await glide(from, start, 1300);                               // the cursor eases onto the first block
await sleep(600);                                             // hover: it lifts
await page.click(start.map(Math.round));                     // push
const end = [start[0] + 60, start[1] + 140];
await glide(start, end, 700);                                 // out of the way while it runs
await page.until(() => Domino.state().arrived, { timeout: 40000, what: 'arrived' });
await sleep(900);                                             // the sign lands face up
const home = await page.run(() => { const r = document.getElementById('home').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await glide(end, home, 1100);                                 // and the cursor goes to the way home
await sleep(1600);

await page.send('Page.stopScreencast');
await pending;
// the thud's moment in wall-clock seconds, the same clock as the screencast's frame times
const thudWall = await page.run(() => Date.now() / 1000 - (performance.now() - Domino.thudAt()) / 1000);
const audioBytes = await page.run(() => new Promise((res) => { window.__rec.onstop = () => { window.__blob = new Blob(window.__chunks); res(window.__blob.size); }; window.__rec.stop(); }));
const parts = [];
for (let o = 0; o < audioBytes; o += 3e6) {
  parts.push(Buffer.from(await page.run(async (o) => { const buf = new Uint8Array(await window.__blob.slice(o, o + 3e6).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); }, o), 'base64'));
}
writeFileSync(media + 'demo-audio.m4a', Buffer.concat(parts));
const t0 = frames[0].t;
writeFileSync(framesDir + 'frames.json', JSON.stringify(frames.map((f) => ({ file: f.file, t: f.t - t0 }))));
writeFileSync(media + 'demo-sync.json', JSON.stringify({ thud: thudWall - t0 }));
const dur = frames.at(-1).t - t0;
console.log(`${frames.length} frames over ${dur.toFixed(1)} s (${(frames.length / dur).toFixed(0)} fps), thud at ${(thudWall - t0).toFixed(2)} s, sound ${(audioBytes / 1e6).toFixed(1)} MB`, page.errors.length ? page.errors : 'no errors');
await page.close();
