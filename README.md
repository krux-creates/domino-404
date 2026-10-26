# Domino 404

**Live: [domino-404.vercel.app](https://domino-404.vercel.app)** (any wrong path there shows it too)

![The 404 in rainbow wooden dominoes, half of them fallen](media/preview.jpg)

A 404 page where the "404" is a run of rainbow wooden dominoes. Push the first block and the
chain runs through the 4, round the 0, on through the second 4 and into a sign that falls face up
reading **TAKE ME HOME ↙**, a link home. You can also push any block, flick one in any direction,
roll glass marbles into them, and stand them all back up.

One file: `index.html` (Three.js r186 and Rapier 0.21 from jsDelivr, fonts from Google Fonts).

```bash
python3 tools/serve.py 3015 .
```

## Controls

| Do | What happens |
| --- | --- |
| Click or tap a block | It tips toward the blocks still standing next to it |
| Drag from a block | It falls the way you dragged (backwards runs the chain back to the start) |
| Drag or swipe the floor | A glass marble appears where you press; drag to aim (dotted path, longer = harder) and let go to roll it. A tap drops one from above |
| Press a marble | Catches it, rolling or not, to aim and throw again |
| Space | Runs the whole thing from the first block (stands them up first if needed) |
| Stand them up (or R) | Every block rises back into place in a wave along the chain. The button appears once something has fallen, and Back to home glides aside to make room |
| Click the fallen sign | Goes home |

## Layout

Minimal, after Mobbin's quieter 404s (Lassie, Sana, Paraform, Cloudstudio, Analogue Agency for
the centred stack).
- **The dominoes are the hero.** One caption sits centred under them: "This page toppled over."
  (Bricolage Grotesque 600, 24–36 px), "Give the first block a push and watch your way home
  unfold.", and a single dark "Back to home" pill. The hint, the 404 and the caption are centred
  as one stack.
- **Hints are painted on the floor** just above the 404, in muted taupe JetBrains Mono: "Click a
  block or press Space · drag the floor to roll a marble" (on a phone: "Tap a block" over "swipe
  to roll a marble"). The line is an HTML element mapped onto the floor plane with a homography,
  so it stays crisp. Laid exactly on the floor, the line fanned out (its left half leaned like
  italics), so most of that fan is taken out and it reads as upright type. Each half drops out
  once you have done it.
- **The first block rocks** forward a few degrees every few seconds until something falls.
- **A hovered block** rises a little, tilts the way a click would tip it, and gets a soft
  shadow under it.
- **Background:** warm ivory with soft colour in the corners (pink top right, sage bottom left,
  periwinkle along the bottom), after mymind and Oevra. Each glow wanders and breathes on its own
  20–40 second loop, leans away from the pointer, and swells when the run reaches home. Where the
  periwinkle fades into the ivory it passes through a faint blush; mixed straight, that band came
  out a flat grey under the buttons. All motion stops under reduced motion.
- **On a portrait phone** the digits are condensed (same height, about three quarters of the
  width), since the screen is short of width, not height, so each block comes out bigger. The
  scene renders at the phone's full 3x.

## How it works

- **Layout.** Each stroke of the 404 is a curve (lines, Béziers, an ellipse) sampled every 0.55
  domino heights, with each domino facing along the curve. 
- **Junctions.** Where a run meets the side of another (the 4's corner, its bar meeting the stem,
  the way into the 0 and the branch out of it), the falling domino passes beside the next one
  rather than hitting it square. These links are marked `assist`: the page gives the branch a tap
  at the moment of contact. Along a run, physics does the work, and a tap only follows if the
  next block still hasn't gone 350 or 900 ms later.
- **The 0 is one loop.** It starts at the left where the run comes in, goes up over the top and
  all the way round, and stops just short of where it began; the way on to the second 4 branches
  off its right side, angled like a 4's diagonal leaving its bar. It used to split into two arcs
  that met head on at the right, which left crossed and propped blocks there.
- **Physics.** One unit is one domino height, gravity 27, a 1/120 s fixed step. Bodies never
  sleep: a sleeping domino soaked up the hit for a step and the run crawled.
- **Look.** Glossy painted-wood blocks (a canvas grain texture under a clearcoat) in one
  instanced mesh, room-environment light, a soft directional shadow on a shadow-only floor
  over the backdrop, so the page colour and the floor are the same. The sign is low and wide
  (3.8 × 1.55): a tall one hid the hook's last blocks so they seemed to stand on top of it.
- **Marbles.** Clear glass (transmission) with a twisted cat's-eye swirl in a domino colour, so
  the spin shows as it rolls, and a soft blob for a shadow. The aim dots warm from ink to red as
  you pull harder. Invisible edges along the four sides of the screen bounce marbles back;
  collision groups keep the dominoes from touching them. Marbles can be grabbed and aimed while
  the blocks stand up and roll the moment they are back. A frosted layer behind the caption,
  invisible over the paper, blurs a marble that rolls underneath. Up to six marbles; the oldest
  fades out.
- **Sound.** Each falling block makes a short wooden clack: a band-passed noise tap plus a
  falling tone, panned by its position on screen. Marbles have their own: a pick when you
  press, a flick and rush of air when you let go, a knock when one strikes a block, a clink
  against another marble, a bump when a dropped one lands, a soft tock off an edge, and a low
  roll that swells with speed. No audio files.
- **Resolution guard.** Two seconds under ~45 fps steps the pixel ratio down (not below 1) and
  the shadow map to 1024.

## Research and references

- Their reference: rainbow wooden domino blocks (Google Images, "dominoes blocks game").
- Domino builds: [manthrax](https://manthrax.github.io/dominos/index.html) (curve sampling,
  instancing, fall detection by up vector, reset), [Topple](https://topplegame.com/) (Three.js,
  recorded wood clacks), the [Rapier dominoes lesson](https://www.educative.io/courses/learn-threejs-for-computer-graphics/simulating-dominos-in-rapier).
  I found no existing domino 404.
- Layout and type: Mobbin 404s from Fiasco (huge numerals, quiet corner links), Pentagram,
  Maxima Therapy and Acctual (numerals built from objects).

## QA (all in headless Chrome, real time)

| Script | Checks |
| --- | --- |
| `node qa/run.mjs` | full run: every block down and the sign falls (RUNS=3 repeats; W, H for size) |
| `node qa/interact.mjs` | hover cursor, mid-run click, stand up, marble, Space, sign link |
| `node qa/edge.mjs` | phone touch (off-centre tap, swipe, no scroll), reduced motion, no WebGL |
| `node qa/sound.mjs` | the run makes sound without clipping; backwards flick reaches the start |
| `node qa/marbles.mjs` | launch sound, knocks on blocks, catch and re-throw, tap to drop, edge bounce stays in view |
| `node qa/bottom.mjs` | a throw from the bottom of the screen reaches the 404, at rest and during a run (TOUCH=1 W=390 H=844 for a phone) |
| `node qa/look.mjs` | 7 window sizes: no text touches the 404, nothing off screen, hint clear of the art |
| `node qa/states.mjs` | captures rest, mid-run, after and standing; measures the hint's slant and the button glide (W, H, DPR, TOUCH, TAG) |
| `node qa/marble.mjs`, `qa/closeups.mjs` | frame strips and close-ups for looking at |
