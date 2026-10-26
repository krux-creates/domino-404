// The marble, frame by frame: press on the floor, drag, hold (aim), release, then the roll.
// Captures a strip of frames to qa/out/marble-*.png and logs where the marble goes.
//   node qa/marble.mjs        env: W, H, DX, DY (drag in px from the press point), FROM ("x,y")
import { launch, sleep } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1440), H = +(process.env.H || 900);
const page = await launch({ width: W, height: H });
await page.size(W, H, { dpr: 1 });
try {
  await page.goto('/', { settle: 400 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
  await sleep(300);
  // start below the first 4's stem and drag up-right toward the 0
  const stem = await page.run(() => {
    const ds = Domino.pieces.filter((p) => p.kind === 'domino' && p.restPos.x < -8 && p.restPos.z > 4);
    return Domino.screen(ds.sort((a, b) => b.restPos.z - a.restPos.z)[0].id);
  });
  const from = process.env.FROM ? process.env.FROM.split(',').map(Number) : [stem[0] - 120, stem[1] + 70];
  const dx = +(process.env.DX ?? 260), dy = +(process.env.DY ?? -60);
  await page.move(...from);
  await page.mouse('mousePressed', ...from);
  await sleep(60);
  await page.shot(`${OUT}marble-0-press.png`);
  for (let i = 1; i <= 14; i++) { await page.move(from[0] + dx * i / 14, from[1] + dy * i / 14, { buttons: 1 }); await sleep(16); }
  await sleep(150);
  await page.shot(`${OUT}marble-1-aim.png`);
  await page.mouse('mouseReleased', from[0] + dx, from[1] + dy);
  const t0 = Date.now();
  const track = [];
  for (const [ms, name] of [[120, '2-launch'], [450, '3-roll'], [1000, '4-hit'], [2200, '5-after'], [4500, '6-rest']]) {
    await sleep(ms - (Date.now() - t0));
    const s = await page.run(() => ({ ...Domino.state(), m: window.Domino.marble?.() ?? null }));
    track.push(`${ms}ms down=${s.down} marbles=${s.marbles} ${s.m ? JSON.stringify(s.m) : ''}`);
    await page.shot(`${OUT}marble-${name}.png`);
  }
  console.log(track.join('\n'));
  if (page.errors.length) console.log('errors', page.errors);
} finally {
  await page.close();
}
