// Is there sound, and is it sane? Taps the page's compressor with an analyser before load,
// runs the chain, and samples the output level. Also flicks a block backwards to check the
// run goes the other way.
//   node qa/sound.mjs
import { launch, sleep } from './chrome.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const page = await launch({ width: 1440, height: 900 });
try {
  await page.beforeLoad(`
    const orig = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
      const c = orig.call(this);
      const a = this.createAnalyser();
      a.fftSize = 2048;
      c.connect(a);
      window.__tap = a;
      return c;
    };`);
  await page.goto('/', { settle: 400 });
  await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
  // a real Space press starts the audio (it needs a gesture) and the run
  await page.key(' ');
  const levels = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 11000) {
    const peak = await page.run(() => {
      if (!window.__tap) return -1;
      const d = new Float32Array(window.__tap.fftSize);
      window.__tap.getFloatTimeDomainData(d);
      let m = 0;
      for (const v of d) m = Math.max(m, Math.abs(v));
      return m;
    });
    levels.push(peak);
    await sleep(40);
  }
  const heard = levels.filter((v) => v > 0.02).length, max = Math.max(...levels);
  check('the run makes sound', heard > 20, `${heard}/${levels.length} samples above -34 dBFS`);
  check('and it does not clip', max < 0.99, `peak ${max.toFixed(2)}`);
  check('the audio is running', (await page.run(() => window.__tap?.context.state)) === 'running');

  // Flick a block on the first 4's bar backwards (toward the start): the run should go back to the start.
  await page.press('Stand them up');
  await page.until(() => Domino.state().mode === 'play' && Domino.state().down === 0, { timeout: 8000, what: 'reset' });
  const id = await page.run(() => Domino.pieces.filter((p) => p.kind === 'domino' && p.restPos.z === 1.8 && p.restPos.x > -14 && p.restPos.x < -11)[0].id);
  const [x, y] = await page.run((i) => Domino.screen(i), id);
  await page.move(x, y);
  await page.mouse('mousePressed', x, y);
  for (let i = 1; i <= 8; i++) { await page.move(x - i * 10, y, { buttons: 1 }); await sleep(16); }
  await page.mouse('mouseReleased', x - 80, y);
  await page.until(() => Domino.pieces[Domino.START].fired, { timeout: 8000, what: 'the start to fall' }).catch(() => {});
  const r = await page.run((i) => ({ start: Domino.pieces[Domino.START].fired, dir: Domino.pieces[i].dir, down: Domino.state().down }), id);
  check('flicking a block backwards runs the chain back to the start', r.start && r.dir === -1, JSON.stringify(r));
  check('no page errors', !page.errors.length, page.errors.join(' | '));
} finally {
  await page.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
