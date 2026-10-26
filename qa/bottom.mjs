// Throwing from the bottom of the screen, at rest and while the run is going: the marble should
// leave your finger, travel up into the 404 and knock blocks over.
//   node qa/bottom.mjs        env: W, H, TOUCH=1 for a phone with a finger
import { launch, sleep } from './chrome.mjs';

const W = +(process.env.W || 1440), H = +(process.env.H || 900), TOUCH = !!process.env.TOUCH;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const page = await launch({ width: W, height: H });
await page.size(W, H, { touch: TOUCH, dpr: TOUCH ? 2 : 1 });
if (TOUCH) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

async function flick(from, to) {
  if (TOUCH) {
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
    for (let i = 1; i <= 10; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * i / 10, y: from[1] + (to[1] - from[1]) * i / 10 }] }); await sleep(16); }
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  await page.move(...from);
  await page.mouse('mousePressed', ...from);
  for (let i = 1; i <= 10; i++) { await page.move(from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10, { buttons: 1 }); await sleep(16); }
  await page.mouse('mouseReleased', ...to);
}
async function throwFromBottom(label) {
  // a point low on the screen, beside the caption, aimed up at the first 4's stem
  const stem = await page.run(() => {
    const ds = Domino.pieces.filter((p) => p.kind === 'domino' && p.restPos.x < -8 && p.restPos.z > 4);
    return Domino.screen(ds.sort((a, b) => b.restPos.z - a.restPos.z)[0].id);
  });
  const cap = await page.run(() => { const r = document.getElementById('caption').getBoundingClientRect(); return [r.left, r.top, r.bottom]; });
  const from = [Math.max(40, Math.min(stem[0], cap[0] - 60)), Math.round(Math.min(H - 80, cap[2] + 10))];
  const before = await page.run(() => Domino.marbleList().length);
  const downBefore = await page.run(() => Domino.state().down);
  const target = [stem[0], stem[1] + 30];
  await flick(from, target);
  await sleep(150);
  const list = await page.run(() => Domino.marbleList());
  const m = list.at(-1);
  const start = m ? await page.run((m) => Domino.project(m), m) : null;
  await page.until(() => Domino.state().mode === 'play', { timeout: 6000, what: 'play' });
  await sleep(1400);
  const later = await page.run(() => Domino.marbleList().at(-1));
  const end = later ? await page.run((m) => Domino.project(m), later) : null;
  const made = list.length > before;
  check(`${label}: a press at the bottom makes a marble`, made, `pressed at ${from.map(Math.round)}`);
  const downAfter = await page.run(() => Domino.state().down);
  const way = from[1] - target[1], went = end ? from[1] - end[1] : 0;
  check(`${label}: it travels up into the 404`, !!end && (went >= way * 0.6 || downAfter > downBefore), end ? `screen y ${Math.round(from[1])} → ${Math.round(end[1])} of ${Math.round(target[1])}, ${downAfter - downBefore} knocked` : 'no marble');
}

try {
  await page.goto('/', { settle: 400 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
  await sleep(300);
  await throwFromBottom('at rest');
  await page.run(() => Domino.run());
  await sleep(1500);
  await throwFromBottom('while the run is going');
  check('no page errors', !page.errors.length, page.errors.join(' | '));
} finally {
  await page.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
