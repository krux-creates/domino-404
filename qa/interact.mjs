// Real mouse and keyboard play in headless Chrome: push a block mid-run, stand them up with the
// button, roll a marble into the stem of the first 4, run the whole thing with Space, then
// check the fallen home block is a link. Captures go to qa/out/.
//   node qa/interact.mjs        env: W, H
import { launch, sleep } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1440), H = +(process.env.H || 900);
const page = await launch({ width: W, height: H });
await page.size(W, H);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const state = () => page.run(() => Domino.state());
const waitPlay = () => page.until(() => Domino.state().mode === 'play', { timeout: 30000, what: 'play mode' });
try {
  await page.goto('/', { settle: 400 });
  await waitPlay();

  // 1. Click a domino on the 0's upper arc: everything after it falls, the lead-in stays up.
  const target = await page.run(() => {
    // the 8th domino of the upper arc: first piece whose rest position is on the ellipse's upper half
    const arc = Domino.pieces.filter((p) => p.kind === 'domino' && Math.abs(p.restPos.x) < 3 && p.restPos.z < -4);
    return arc[0].id;
  });
  const [tx, ty] = await page.run((id) => Domino.screen(id), target);
  await page.move(tx, ty);
  await sleep(120);
  const cursor = await page.run(() => document.getElementById('scene').style.cursor);
  check('hovering a block shows a pointer', cursor === 'pointer', cursor);
  await page.click([tx, ty]);
  await sleep(3500);
  await page.shot(`${OUT}click-mid.png`);
  await page.until(() => Domino.state().arrived, { timeout: 20000, what: 'home after a mid-run click' }).catch(() => {});
  await sleep(1200);
  let s = await state();
  const after = await page.run((from) => {
    // every piece reachable forward from the clicked one should have gone over
    const seen = new Set([from]), queue = [from];
    while (queue.length) for (const { id } of Domino.pieces[queue.shift()].next) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    const left = [...seen].filter((id) => !Domino.pieces[id].fired);
    return { reach: seen.size, left, leadUp: Domino.pieces[Domino.START].tilt < 0.1 };
  }, target);
  check('clicking a block mid-run knocks over everything after it, home included', s.arrived && !after.left.length, `${after.reach - after.left.length}/${after.reach}, still up: ${JSON.stringify(after.left)}`);
  check('…but not what comes before it', after.leadUp);

  // 1b. Click a block at a dead end (the bottom of the first 4's stem): it falls back into the run.
  await page.press('Stand them up');
  await page.until(() => Domino.state().mode === 'play' && Domino.state().down === 0, { timeout: 8000, what: 'reset' });
  const end = await page.run(() => Domino.pieces.filter((p) => p.kind === 'domino' && !p.next.length && p.restPos.x < -8 && p.restPos.z > 4)[0].id);
  await page.click((await page.run((id) => Domino.screen(id), end)).map(Math.round));
  await sleep(1500);
  const back = await page.run((id) => { const p = Domino.pieces[id]; return { dir: p.dir, prevFell: Domino.pieces[p.prev[0].id].fired }; }, end);
  check('clicking the last block of a run tips it back into the run', back.dir === -1 && back.prevFell, JSON.stringify(back));

  // 2. Stand them up with the button.
  await page.press('Stand them up');
  await sleep(400);
  await page.shot(`${OUT}standing-up.png`);
  await waitPlay();
  s = await state();
  check('"Stand them up" puts every block back', s.down === 0 && !s.arrived, `${s.down} down`);

  // 3. Roll a marble from the empty floor into the first 4's lower stem.
  const stem = await page.run(() => {
    const ds = Domino.pieces.filter((p) => p.kind === 'domino' && p.restPos.x < -8 && p.restPos.z > 4);
    return ds.sort((a, b) => b.restPos.z - a.restPos.z)[1].id;
  });
  const [sx, sy] = await page.run((id) => Domino.screen(id), stem);
  const from = [sx - 220, sy + 40];
  await page.move(...from);
  await page.mouse('mousePressed', ...from);
  for (let i = 1; i <= 12; i++) { await page.move(from[0] + (sx - from[0]) * i / 12, from[1] + (sy - from[1]) * i / 12, { buttons: 1 }); await sleep(16); }
  await page.shot(`${OUT}aim.png`);
  await page.mouse('mouseReleased', sx, sy);
  await sleep(2500);
  s = await state();
  check('dragging the floor rolls a marble', s.marbles === 1, `${s.marbles} marbles`);
  check('the marble knocks blocks over', s.down > 0, `${s.down} down`);
  await page.shot(`${OUT}marble.png`);

  // 4. Space runs it from the start (standing everything up first) to the home block.
  await page.key(' ');
  await page.until(() => Domino.state().arrived, { timeout: 30000, what: 'home to fall' });
  await sleep(1500);
  s = await state();
  check('Space stands them up and runs the chain home', s.arrived && s.down === s.total, `${s.down}/${s.total}`);
  const pill = await page.run(() => document.getElementById('home').classList.contains('arrived'));
  check('the Back to home link becomes the call to action', pill);

  // 5. The fallen home block is a link.
  const [hx, hy] = await page.run(() => Domino.screen(Domino.HOME_ID));
  await page.move(hx, hy);
  await sleep(100);
  const homeCursor = await page.run(() => document.getElementById('scene').style.cursor);
  check('the fallen home block shows a pointer', homeCursor === 'pointer', homeCursor);
  await page.shot(`${OUT}home-fallen.png`);
  const nav = page.once('Page.frameNavigated');
  await page.click([hx, hy]);
  const went = await Promise.race([nav.then((p) => p.frame.url), sleep(3000).then(() => null)]);
  check('clicking it goes home', !!went, went ?? 'no navigation');

  check('no page errors', !page.errors.length, page.errors.join(' | '));
} finally {
  await page.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
