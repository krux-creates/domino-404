// Captures for review: the intro mid-way and the resting page at several window sizes, plus
// layout measurements (does any text box touch the 404's footprint or leave the window?).
//   node qa/look.mjs            writes qa/out/look-<size>.png and qa/out/intro.png
import { launch, sleep } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sizes = (process.env.SIZES || '1920x1080,1440x900,1280x720,768x1024,844x390,390x844,360x740').split(',').map((s) => s.split('x').map(Number));
const page = await launch({ width: 1440, height: 900 });
let bad = 0;
try {
  await page.size(1440, 900);
  await page.goto('/', { settle: 1050 });
  await page.shot(`${OUT}intro.png`);
  for (const [w, h] of sizes) {
    await page.size(w, h, { dpr: w < 600 ? 2 : 1 });
    await page.goto('/', { settle: 400 });
    await page.until(() => window.Domino?.state().mode === 'play', { timeout: 30000, what: 'play' });
    await sleep(900);
    const m = await page.run(() => {
      // screen box of every resting piece (centre and top), and every visible text box
      const pts = Domino.pieces.map((p) => Domino.screen(p.id));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const art = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      const boxes = [...document.querySelectorAll('h1, .caption p, .home, .ghost:not([hidden]), .sound, .tip.on')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el: el.className || el.tagName, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
      });
      const hits = boxes.filter((b) => !b.el.includes('tip') && b.x1 > art.x0 && b.x0 < art.x1 && b.y1 > art.y0 && b.y0 < art.y1).map((b) => b.el);
      // the marble tip must sit clear of the caption and of every domino
      const ft = document.getElementById('floorText');
      const fr = ft.classList.contains('on') ? ft.getBoundingClientRect() : null;
      const mt = fr ? { x0: fr.left, x1: fr.right, y0: fr.top, y1: fr.bottom } : null;
      const cap = document.getElementById('caption').getBoundingClientRect();
      const tipOnCaption = mt ? mt.x1 > cap.left && mt.x0 < cap.right && mt.y1 > cap.top && mt.y0 < cap.bottom : false;
      const tipOnBlocks = mt ? pts.filter(([x, y]) => x > mt.x0 - 4 && x < mt.x1 + 4 && y > mt.y0 - 4 && y < mt.y1 + 4).length : 0;
      const off = boxes.filter((b) => b.x0 < 0 || b.y0 < 0 || b.x1 > innerWidth + 0.5 || b.y1 > innerHeight + 0.5).map((b) => b.el);
      // the start tag must not cover any domino
      const tag = boxes.find((b) => b.el === 'tip on');
      const under = tag ? pts.filter(([x, y]) => x > tag.x0 - 4 && x < tag.x1 + 4 && y > tag.y0 - 4 && y < tag.y1 + 4).length : 0;
      const h1 = parseFloat(getComputedStyle(document.querySelector('h1')).fontSize);
      const smallest = Math.min(...[...document.querySelectorAll('.label, .ghost, .home, .caption p, .tip.on span')].map((el) => parseFloat(getComputedStyle(el).fontSize)));
      return { art: { w: Math.round(art.x1 - art.x0), h: Math.round(art.y1 - art.y0) }, hits, off, under, tag: tag ? document.getElementById('startTag').innerText.replace(/\\n/g, ' / ') : null, marbleTip: !!mt, tipOnCaption, tipOnBlocks, h1, smallest };
    });
    const ok = !m.hits.length && !m.off.length && !m.under && !m.tipOnCaption && !m.tipOnBlocks;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${w}x${h}  404 is ${m.art.w}x${m.art.h}px  h1 ${m.h1}px  smallest text ${m.smallest}px  tag "${m.tag}" over ${m.under} pieces  floor text ${m.marbleTip ? (m.tipOnCaption || m.tipOnBlocks ? 'OVERLAPS' : 'clear') : 'hidden'}  text over art: ${JSON.stringify(m.hits)}  off-screen: ${JSON.stringify(m.off)}`);
    await page.shot(`${OUT}look-${w}x${h}.png`);
  }
  if (page.errors.length) { console.log('errors', page.errors); bad++; }
} finally {
  await page.close();
}
process.exit(bad ? 1 : 0);
