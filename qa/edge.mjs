// Edge cases: a finger on a phone (tap slightly off a domino, swipe the floor), reduced motion,
// and a browser without WebGL.
//   node qa/edge.mjs
import { launch, sleep } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

// 1. Touch on a phone
{
  const page = await launch({ width: 390, height: 844 });
  try {
    await page.size(390, 844, { touch: true, dpr: 2 });
    await page.goto('/', { settle: 400 });
    await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
    const [x, y] = await page.run(() => Domino.screen(Domino.START));
    await page.touch([x + 7, y + 9]);
    await sleep(2500);
    // the first push used up the block half, so the painted line now only speaks of the floor
    const hint = await page.run(() => document.getElementById('floorText').textContent);
    check('a finger switches the floor hint to touch wording', /swipe/i.test(hint) && !/drag|click/i.test(hint), hint);
    let s = await page.run(() => Domino.state());
    check('a fingertip slightly off the first domino still pushes it', s.down > 5, `${s.down} down`);
    await page.run(() => Domino.reset());
    await page.until(() => Domino.state().mode === 'play' && Domino.state().down === 0, { timeout: 8000, what: 'reset' });
    // swipe from empty floor below the 0 up into it
    const [zx, zy] = await page.run(() => Domino.screen(Domino.pieces.filter((p) => Math.abs(p.restPos.x) < 1 && p.restPos.z > 5)[0].id));
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zx, y: zy + 70 }] });
    for (let i = 1; i <= 8; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: zx, y: zy + 70 - i * 10 }] }); await sleep(16); }
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(2000);
    s = await page.run(() => Domino.state());
    check('a swipe on the floor rolls a marble', s.marbles === 1, `${s.marbles} marbles, ${s.down} down`);
    const scrolled = await page.run(() => scrollY);
    check('the page does not scroll under a swipe', scrolled === 0);
    await page.shot(`${OUT}touch.png`);
    check('no errors on touch', !page.errors.length, page.errors.join(' | '));
  } finally { await page.close(); }
}

// 2. Reduced motion: no intro wave, straight to standing blocks, still playable.
{
  const page = await launch({ width: 1280, height: 800 });
  try {
    await page.reducedMotion(true);
    await page.goto('/', { settle: 200 });
    const first = await page.run(() => Domino.pieces[Domino.START].pos.y.toFixed(2));
    check('reduced motion: blocks start standing (no intro wave)', first === '0.50', `first domino centre y ${first}`);
    await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
    await page.run(() => Domino.run());
    await page.until(() => Domino.state().arrived, { timeout: 30000, what: 'home' });
    check('reduced motion: the run still works', true);
  } catch (e) { check('reduced motion', false, e.message); } finally { await page.close(); }
}

// 3. No WebGL: the message and the way home are still there.
{
  process.env.CHROME_ARGS = '--disable-webgl --disable-3d-apis';
  const page = await launch({ width: 1280, height: 800 });
  try {
    await page.goto('/', { settle: 1500 });
    const r = await page.run(() => ({
      nogl: document.documentElement.classList.contains('no-gl'),
      h1: document.querySelector('h1').innerText,
      home: getComputedStyle(document.getElementById('home')).display !== 'none',
      tools: getComputedStyle(document.getElementById('reset')).display,
    }));
    check('no WebGL: page says so quietly and keeps the message and the home link', r.nogl && r.home && r.tools === 'none' && /toppled/.test(r.h1), JSON.stringify(r));
    await page.shot(`${OUT}nogl.png`);
  } finally { await page.close(); delete process.env.CHROME_ARGS; }
}
process.exit(results.every(Boolean) ? 0 : 1);
