// Captures every state of the page at one size: intro, rest, mid-run, after the run and while it
// stands back up, plus measurements of the things that went wrong before (the 0's join blocks,
// the button glide, the floor hint's slant). Into qa/out/state-<tag>-*.png.
//   node qa/states.mjs        env: W, H, DPR, TOUCH=1, TAG
import { launch, sleep } from './chrome.mjs';
import { fileURLToPath } from 'node:url';

const W = +(process.env.W || 1440), H = +(process.env.H || 900), DPR = +(process.env.DPR || 2);
const TOUCH = !!process.env.TOUCH, TAG = process.env.TAG || `${W}x${H}`;
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const page = await launch({ width: W, height: H });
await page.size(W, H, { dpr: DPR, touch: TOUCH });
if (TOUCH) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
try {
  await page.goto('/', { settle: 300 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
  await sleep(1200);
  await page.shot(`${OUT}state-${TAG}-rest.png`);
  const hint = await page.run(() => {
    const el = document.getElementById('floorText');
    const m = new DOMMatrix(getComputedStyle(el).transform), Hh = el.offsetHeight, Ww = el.offsetWidth;
    const map = (x, y) => { const p = m.transformPoint(new DOMPoint(x, y, 0, 1)); return [p.x / p.w, p.y / p.w]; };
    const lean = (x) => { const a = map(x, 0), b = map(x, Hh); return +((a[0] - b[0]) / (b[1] - a[1])).toFixed(3); };
    const r = el.getBoundingClientRect();
    return { text: el.innerText.replace(/\n/g, ' / '), lean: [lean(0), lean(Ww)], width: Math.round(r.width), bottom: Math.round(r.bottom), on: el.classList.contains('on') };
  });
  const artTop = await page.run(() => Math.min(...Domino.pieces.map((p) => Domino.screen(p.id)[1])));
  const artW = await page.run(() => { const xs = Domino.pieces.map((p) => Domino.screen(p.id)[0]); return Math.round(Math.max(...xs) - Math.min(...xs)); });
  console.log('hint', JSON.stringify(hint), 'top block y', Math.round(artTop), 'art width', artW);
  const homeX0 = await page.run(() => document.getElementById('home').getBoundingClientRect().left);
  await page.run(() => Domino.run());
  // the button glide: sample Back to home's left edge as Stand them up appears
  const xs = [];
  for (let i = 0; i < 14; i++) { xs.push(Math.round(await page.run(() => document.getElementById('home').getBoundingClientRect().left))); await sleep(40); }
  console.log('home left from', Math.round(homeX0), 'through', xs.join(' '));
  await sleep(3400);
  await page.shot(`${OUT}state-${TAG}-mid.png`);
  await page.until(() => Domino.state().arrived, { timeout: 30000, what: 'arrived' });
  await sleep(2500);
  await page.shot(`${OUT}state-${TAG}-after.png`);
  const s = await page.run(() => Domino.state());
  console.log('after run', `${s.down}/${s.total} down, arrived ${s.arrived}, pixel ratio ${s.pixelRatio}`);
  await page.press('Stand them up');
  await sleep(2600);
  await page.shot(`${OUT}state-${TAG}-standing.png`);
  console.log(page.errors.length ? page.errors : 'no errors');
} finally {
  await page.close();
}
