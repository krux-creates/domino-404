// Every marble action with a real mouse: throw (launch sound, then knocks on the blocks it hits),
// catch a rolling marble and throw it again, tap the floor to drop one (bump), throw hard at the
// edge of the screen (it bounces back and stays in view), and the sound output is live.
//   node qa/marbles.mjs        env: W, H
import { launch, sleep } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1440), H = +(process.env.H || 900);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const page = await launch({ width: W, height: H });
await page.size(W, H);
const sounds = () => page.run(() => Domino.sounds());
const marble = () => page.run(() => Domino.marble());
async function drag(from, to, steps = 12, hold = 120) {
  await page.move(...from);
  await page.mouse('mousePressed', ...from);
  for (let i = 1; i <= steps; i++) { await page.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps, { buttons: 1 }); await sleep(16); }
  await sleep(hold);
  await page.mouse('mouseReleased', ...to);
}
try {
  await page.beforeLoad(`
    const orig = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () { const c = orig.call(this); const a = this.createAnalyser(); a.fftSize = 2048; c.connect(a); window.__tap = a; return c; };`);
  await page.goto('/', { settle: 400 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
  await sleep(300);
  check('four invisible edges around the stage', (await page.run(() => Domino.edges())) === 4);

  // 1. throw from below the first 4 toward the 0
  const stem = await page.run(() => {
    const ds = Domino.pieces.filter((p) => p.kind === 'domino' && p.restPos.x < -8 && p.restPos.z > 4);
    return Domino.screen(ds.sort((a, b) => b.restPos.z - a.restPos.z)[0].id);
  });
  const from = [stem[0] - 120, stem[1] + 70];
  await drag(from, [from[0] + 260, from[1] - 60]);
  await sleep(20);
  let s = await sounds();
  check('letting go plays the launch sound', s.includes('launch'), s.join(','));
  // listen right after the release
  // listen over the first ~300 ms after the release, not one instant
  let peak = 0;
  for (let i = 0; i < 8; i++) { peak = Math.max(peak, await page.run(() => { const d = new Float32Array(2048); window.__tap.getFloatTimeDomainData(d); return Math.max(...d.map(Math.abs)); })); await sleep(30); }
  check('and it is audible', peak > 0.01, `peak ${peak.toFixed(3)}`);
  await sleep(2400);
  s = await sounds();
  const down = (await page.run(() => Domino.state())).down;
  check('hitting blocks plays a knock', s.includes('knock'), s.join(','));
  check('the marble knocks blocks over', down > 0, `${down} down`);

  // 2. catch it and throw it again toward the right
  let m = await marble();
  const mScreen = await page.run(() => Domino.project(Domino.marble()));
  await page.move(...mScreen);
  await page.mouse('mousePressed', ...mScreen);
  await sleep(150);
  m = await marble();
  check('pressing a marble catches it', m.held && m.speed < 0.05, JSON.stringify(m));
  for (let i = 1; i <= 10; i++) { await page.move(mScreen[0] + 18 * i, mScreen[1] - 4 * i, { buttons: 1 }); await sleep(16); }
  await page.mouse('mouseReleased', mScreen[0] + 180, mScreen[1] - 40);
  await sleep(150);
  m = await marble();
  s = await sounds();
  check('…and throws it again', !m.held && m.speed > 3 && s.filter((k) => k === 'launch').length >= 2, JSON.stringify(m));
  await page.shot(`${OUT}marbles-rethrow.png`);

  // 3. tap empty floor near the bottom left: a marble drops in and bumps
  await page.click([60, Math.round(H * 0.55)]);
  await sleep(60);
  const high = await page.run(() => Domino.marbleList().at(-1));
  await sleep(1200);
  s = await sounds();
  check('a tap drops a marble that lands with a bump', high.y > 1 && s.includes('bump'), `start y ${high.y}`);

  // 4. a hard throw at the left edge bounces back and stays on screen
  await drag([300, Math.round(H * 0.15)], [40, Math.round(H * 0.15)], 8, 60);
  await sleep(1800);
  const last = await page.run(() => { const m = Domino.marbleList().at(-1); return { ...m, screen: Domino.project(m) }; });
  s = await sounds();
  check('a marble thrown at the edge bounces back', s.includes('edge'), s.slice(-8).join(','));
  check('…and stays in view', last.screen[0] > 0 && last.screen[0] < W, `x on screen ${Math.round(last.screen[0])}`);
  await page.shot(`${OUT}marbles-edge.png`);

  check('no page errors', !page.errors.length, page.errors.join(' | '));
} finally {
  await page.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
