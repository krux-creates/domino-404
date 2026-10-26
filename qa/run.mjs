// Full run in headless Chrome, in real time: load, wait for physics, push the first domino and
// watch the count until the home block falls. Saves before/after captures to qa/out/.
//   node qa/run.mjs            env: W, H (viewport), TAG (file suffix), RUNS (repeat count)
import { launch, sleep } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1440), H = +(process.env.H || 900), TAG = process.env.TAG || '', RUNS = +(process.env.RUNS || 1);
const page = await launch({ width: W, height: H });
await page.size(W, H, { dpr: +(process.env.DPR || 1) });
let failed = false;
try {
  await page.goto('/', { settle: 500 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'physics' });
  const fps = await page.run(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
  console.log(`viewport ${W}x${H}, ${fps} fps, overlaps at rest: ${JSON.stringify(await page.run(() => Domino.overlaps()))}`);
  await page.shot(`${OUT}rest${TAG}.png`);
  for (let r = 0; r < RUNS; r++) {
    if (r) { await page.run(() => Domino.reset()); await page.until(() => Domino.state().mode === 'play', { timeout: 8000, what: 'stand up' }); await sleep(300); }
    const t0 = Date.now();
    await page.run(() => Domino.run());
    let s, lastDown = -1, stillFor = 0;
    for (;;) {
      await sleep(250);
      s = await page.run(() => Domino.state());
      if (s.down === lastDown) stillFor += 250; else stillFor = 0;
      lastDown = s.down;
      if ((s.arrived && stillFor > 1200) || stillFor > 3000 || Date.now() - t0 > 30000) break;
    }
    const standing = await page.run(() => Domino.pieces.filter((p) => p.kind === 'domino' && p.tilt < 0.35).map((p) => p.id));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`run ${r + 1}: ${s.down}/${s.total} down, home ${s.arrived ? 'fell' : 'STANDING'}, ${secs}s, standing: ${JSON.stringify(standing)}`);
    if (!s.arrived || standing.length) failed = true;
    if (r === 0) await page.shot(`${OUT}after${TAG}.png`);
  }
  if (page.errors.length) { console.log('page errors:', page.errors); failed = true; }
} finally {
  await page.close();
}
process.exit(failed ? 1 : 0);
