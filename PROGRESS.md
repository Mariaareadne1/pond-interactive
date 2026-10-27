# POND — progress

Built autonomously from the brief, milestone by milestone, starting from a study of MEADOW (`~/Development/meadow`). Each tested milestone was committed and pushed to `Mariaareadne1/pond-interactive`, and the remote SHA checked.

## Milestones

| | What | State |
|---|---|---|
| 0 | Repo, MEADOW study notes (`docs/MEADOW_STUDY.md`), art direction (`docs/ART_DIRECTION.md`) | done |
| 1 | Painted pond tile: depth-banded water, banks, reeds/cattails, stones, jetty and path, dry-brush edge on paper, camera, light, shared shadows, water surface with ripples | done |
| 2 | Koi, minnow, duck (+ duckling), lily pad (+ bud/flower), frog — modelled, painted, inspected from four angles and in the app camera, iterated | done |
| 3 | Placement on the water plane vs the bank, selection box with world units, perspective dragging, frogs perching on pads | done |
| 4 | Behaviours and every click action; feed, rain, breeze; creatures sensing pads, crumbs, leaders and parents | done |
| 5 | Shape recognition, the type picker, "make it a … instead", watercolour bloom (with a pigment stain on the water) and brush reveals | done |
| 6 | UI, undo/redo, persistence and validation, keyboard, PNG capture, recording with the pen line, mobile | done |
| 7 | Polish, scripted demo, gallery, README, CASE_STUDY, this file | done |

## Verification (latest run)

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 63 unit tests pass.
- `npm run test:e2e`: 18 Playwright tests pass against the dev server; `E2E_PROD=1 npm run test:e2e`: the same 18 against the production build.
- `npm run build`: passes (three.js dominates the bundle, as in MEADOW).
- `scripts/verify-recording.mjs`: H.264 MP4, 1280×720, 237 frames in 3.98 s (≈59.5 fps).
- `scripts/demo.mjs 1600 900`: H.264 MP4, 1600×900, 1547 frames in 25.96 s (≈59 fps); contact sheet in `docs/media/demo-contact-sheet.jpg`. Story: a fish blooms in and swims → a lily pad → the fish slips under it → a duck dabbles → a frog drawn on the bank hops onto the pad → feeding draws the fish out → rain.
- `scripts/perf.mjs`: 8.7 ms/frame with 15 creatures at 1440×900 DPR 1; 17.7 ms at DPR 2 (load average ≈ 5.4 during the run).

- Deployed on 2026-10-27 at the author's request: https://pond-interactive.vercel.app (Vercel project `pond-interactive`). Checked live: renders at 60 fps headless, drawing a fish works, no page errors.

## After launch

- Ducks can live on land as well as water (2026-10-27): draw one on the bank (a loop with a head on top, or Duck in the picker) and it stands on short legs, waddles, nibbles instead of dabbling, and can fly off to the pond. Dragging moves a duck freely between bank and water.
- Smooth motion (2026-10-27): fixed fish tails and ducks jittering (raw steering fed to the tail bend, shore avoidance toggling, shore snapping, a flipping glance, time × speed stride phases) with one eased steering model; ducks now go in and out of the water as they please, ducklings following. Covered by a smoothness test suite.

## Known gaps, said plainly

- Only Chromium has been tested (desktop and emulated mobile); Safari and Firefox are untested.
- The leap's height is legible mainly through its shadow and splash from this camera angle.
- Recognition is heuristic and can misread lumpy loops (the picker and the instead-chip cover it).
