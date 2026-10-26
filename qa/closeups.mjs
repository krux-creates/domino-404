// Close-up captures for judging the marble: aim at low and high power, mid-roll, at rest beside
// blocks (shadow), and two marbles resting under the caption (frost). 2x, into qa/out/.
//   node qa/closeups.mjs
import { launch, sleep } from './chrome.mjs';
import { fileURLToPath } from 'node:url';

const page = await launch({ width: 1440, height: 900 });
await page.size(1440, 900, { dpr: 2 });
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
try {
  await page.goto('/', { settle: 400 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
  await sleep(300);
  // aim below the 0, soft then hard, then let go and catch it mid-roll
  const at = await page.run(() => Domino.project({ x: -2, y: 0, z: 7.6 }));
  await page.move(...at);
  await page.mouse('mousePressed', ...at);
  for (let i = 1; i <= 4; i++) { await page.move(at[0] + 14 * i, at[1] - 9 * i, { buttons: 1 }); await sleep(16); }
  await sleep(200);
  await page.shot(`${OUT}aim-soft.png`, { x: at[0] - 60, y: at[1] - 200, width: 420, height: 240 });
  for (let i = 5; i <= 22; i++) { await page.move(at[0] + 14 * i, at[1] - 9 * i, { buttons: 1 }); await sleep(16); }
  await sleep(200);
  await page.shot(`${OUT}aim-hard.png`, { x: at[0] - 60, y: at[1] - 200, width: 420, height: 240 });
  await page.mouse('mouseReleased', at[0] + 14 * 22, at[1] - 9 * 22);
  await sleep(250);
  const m = await page.run(() => Domino.project(Domino.marble()));
  await page.shot(`${OUT}marble-rolling2.png`, { x: m[0] - 60, y: m[1] - 50, width: 120, height: 100 });
  // a dropped marble beside the first 4's stem
  const st = await page.run(() => Domino.project({ x: -8.4, y: 0, z: 5.2 }));
  await page.click(st.map(Math.round));
  await sleep(1800);
  await page.shot(`${OUT}marble-shadow.png`, { x: st[0] - 110, y: st[1] - 110, width: 220, height: 170 });
  // two marbles dropped onto the caption, after one block has fallen so both buttons show
  await page.run(() => Domino.reset());
  await page.until(() => Domino.state().mode === 'play', { timeout: 8000 });
  await page.run(() => Domino.run());
  await sleep(700);
  const h1 = await page.run(() => { const r = document.querySelector('h1').getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.5]; });
  const btn = await page.run(() => { const r = document.getElementById('reset').getBoundingClientRect(); return [r.left + 8, r.top - 4]; });
  for (const p of [h1, btn]) { await page.click(p.map(Math.round)); await sleep(150); }
  await sleep(900);
  const cap = await page.run(() => { const r = document.getElementById('caption').getBoundingClientRect(); return [r.left - 80, r.top - 50, r.width + 160, r.height + 90]; });
  await page.shot(`${OUT}frost.png`, { x: cap[0], y: cap[1], width: cap[2], height: cap[3] });
  console.log(page.errors.length ? page.errors : 'no errors');
} finally {
  await page.close();
}
