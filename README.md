# POND

**Draw on a painted pond and what you drew comes to life.**

**Live: [pond-interactive.vercel.app](https://pond-interactive.vercel.app)**

POND is a small hand-painted pond in the browser, floating as a tile on a sheet of paper. Draw a long loop on the water and a koi blooms into it like a drop of watercolour; a loop with a head on top becomes a duck, a round one a lily pad; a small loop on the bank or on a pad becomes a frog. Then they live their small lives: fish glide and hide under the pads, ducks paddle and dabble with their tails in the air, frogs sit, hop and catch flies, and ripples spread from everything that touches the water.

It is the sibling of [MEADOW](https://github.com/Mariaareadne1/meadow-interactive) (draw a loop, get a sheep): same painted light, same tile-on-paper, same interaction grammar, new world and new creatures.

![A painted pond tile on paper with koi, a duck and duckling, lily pads and frogs](docs/media/01-pond.jpg)

| A fish blooms into the water | Koi, duck, frog and lily, up close |
|---|---|
| ![Bloom](docs/media/03-bloom-strip.jpg) | ![Creatures](docs/media/02-creatures.jpg) |

Demo (26 s, recorded by the app's own recorder, pen line included): [`docs/media/pond-demo-720p.mp4`](docs/media/pond-demo-720p.mp4)

## Run it

```bash
npm install
npm run dev          # http://localhost:5366
```

Needs a browser with WebGL 2. Useful URLs:

| URL | What |
|---|---|
| `/` | Your saved pond, or a few pads, two koi and a duck on first visit |
| `/?showcase` | Every creature at different depths |
| `/?empty` | An empty pond |
| `/?quality=low` | Fewer reeds, tufts and petals, 2× MSAA, lower pixel-ratio cap |

## What you can draw

| Drawn where | Shape | Becomes |
|---|---|---|
| Water | a long loop, or one with a tail notch | **Fish** — a koi, or a silver minnow if drawn small; it faces away from the tail |
| Water | a loop with a bump on top at one end | **Duck**, facing its head |
| Water | a roundish loop | **Lily pad**, sometimes with a bud or a flower |
| Bank or a lily pad | a small loop | **Frog** |
| Anywhere | an in-between shape | the best guess, with a "Make it a … instead" chip for 3 s |

**Draw: Auto · Fish · Duck · Lily · Frog** above the toolbar forces a kind. Drawing sets only where, how big (±15%), which way and what — never the shape of the model — so any loose loop makes a good creature. Paper, tiny scribbles and impossible places (a duck far up the bank, a frog in deep water) get a gentle message and the line shivers away.

## What they do (click one)

| | Actions |
|---|---|
| Fish | **Come here** (then tap the water, or press `C` with the pointer over it) · **Hide** under the nearest pad · **Leap** · **School** (with 3+ fish) |
| Duck | **Dabble** · **Preen** · **Fly** a loop over the pond · **Ducklings** (a smaller duck that follows in a line) |
| Lily pad | **Bloom** / **Close** · **Drift** · **Invite a frog** |
| Frog | **Hop** to the nearest pad or along the bank · **Catch a fly** · **Croak** (with a soft sound only if Sound is on in the menu) |
| Everything | Turn ↺ ↻ · Duplicate · Remove · drag to move (it shrinks as it goes farther away) |

Pond-wide: **Feed** (tap the water to sprinkle crumbs; fish rise and ducks paddle over), **Rain** (10 s of rings on the water; frogs look up, ducks fluff), **Breeze** (reeds lean, petals drift, pads turn).

## Keys

| | |
|---|---|
| Draw · Move · Feed | `D` · `V` · `F` |
| Creature actions | `1`–`4` (in bar order); with nothing selected, `1`–`4` pick Fish/Duck/Lily/Frog and `A` Auto |
| Turn | `Q` / `E`, or scroll |
| Duplicate / remove | `Shift D` / `Delete` |
| Rain · Breeze | `R` · `B` |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Next creature | `Tab` |
| Deselect / cancel | `Esc` |
| Hide interface | `H` |

The menu has Showcase arrangement, Record 12-second clip (MP4/H.264 where supported, else WebM, with the drawn line), Hide interface, Sound, Export/Import scene JSON and Clear the pond. Scenes save automatically in the browser (`{ version: 1, creatures: [...] }`); imported files are validated, clamped and capped.

## How it works (short version)

- **A painted tile in real 3D.** Perspective camera, elevated three-quarter view, solved to fit any aspect (tall screens turn a quarter). Placement is an exact raycast: the water plane for swimmers and floaters, the bank's height function for frogs.
- **Water as paint.** The pond bed is painted in depth bands — sand, turquoise-green, teal-blue — so its colour *is* the water. A thin surface layer adds reflected sky, light streaks, a wet shore line, cool shadows of what floats or flies, and ripple rings. Anything below the surface is tinted and softened by depth.
- **Creatures from code.** Signed-distance bodies meshed with surface nets in a Web Worker (MEADOW's method), flat fins and petals, painted in one shader with MEADOW's lavender-shade light. A fish's body bends with a travelling wave from the tail; its shadow bends with it.
- **The reveal.** In water, a stain of pigment spreads on the wet surface with a darker rim and the creature blooms out from its centre, flat colour first, then light and shade, then a ring. On land, MEADOW's brush strokes sweep tail to nose. Shadows arrive at 60%.
- **Life.** Pure time-based behaviours return flat poses; controllers cross-fade from the pose actually shown and own root motion (S-curves that avoid the bank, leaps that always land in the water, flight loops planned around the pond, hops that ride a drifting pad).

The full write-up is in **[CASE_STUDY.md](CASE_STUDY.md)**; build notes in [PROGRESS.md](PROGRESS.md).

## Development

```bash
npm run typecheck      # tsc
npm run lint           # eslint
npm test               # unit tests (vitest)
npm run test:e2e       # real-browser tests (Playwright, WebGL via Metal)
E2E_PROD=1 npm run test:e2e   # same, against the production build
npm run build          # dist/
```

QA scripts (need the dev server; write to `artifacts/`, gitignored):

| Script | Output |
|---|---|
| `node scripts/shoot.mjs name [query] [w] [h]` | Full-frame screenshot |
| `node scripts/inspect.mjs name [ids…]` | Close-ups of showcase creatures from four angles |
| `node scripts/draw.mjs name fish\|duck\|lily\|frog [x] [y]` | Draws a shape and captures the reveal frame by frame |
| `node scripts/strip.mjs name id action [frames] [every] [crop]` | Filmstrip of one action in the app camera |
| `node scripts/gallery.mjs` | Regenerates everything in `docs/media` |
| `node scripts/demo.mjs 1600 900` | Scripted demo recorded through the app's recorder |
| `node scripts/verify-recording.mjs` | Records 4 s and checks codec, size and frames with ffprobe |
| `node scripts/perf.mjs` | Back-to-back frame timings with a GPU sync |

Headless Chromium must use `--use-angle=metal` on macOS; SwiftShader is far too slow.

## Deploying

Live at **https://pond-interactive.vercel.app** (Vercel project `pond-interactive`). Deploy a new version with `npx vercel --prod` from the repo root; `vercel.json` sets the Vite build, long-lived caching for hashed assets and basic security headers, and `.vercelignore` keeps local artifacts and media out of uploads. It is a static site: no server, keys or environment variables.

## Credits and licences

Code: MIT, © 2026 Maria Showalter. Everything in the scene is generated by code in this repository; no third-party models, textures or images. Fonts: Inter Tight and Fraunces (SIL OFL 1.1) via Fontsource. Engine, light model, stroke handling and tooling are adapted from MEADOW (same author, MIT).
