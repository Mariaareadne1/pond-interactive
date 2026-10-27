# Notes from studying MEADOW

MEADOW (`~/Development/meadow`, MIT, same author) is the parent project. POND
copies its engine and interaction grammar and replaces the world and the
characters. What each part does, and what POND does with it:

| MEADOW | What it does | In POND |
|---|---|---|
| `scene/shaderChunks.ts` | noise, `castLight` (12-tap PCSS-style contact-hardening shadows), `paintLight` (two-tone ramp, lavender shade) | copied as-is; adds an `underwater()` tint shared by everything below the surface |
| `scene/world.ts` | one set of light uniforms, sun upper-left in front | copied; adds ripple and breeze uniforms |
| `scene/camera.ts` | perspective camera, 46° pitch, distance solved by bisection to fit the tile, quarter-turn on tall screens | copied with POND's tile size |
| `scene/terrain.ts` | Voronoi parcels on a warped plane, hedgerows, dry-brush strokes, stipple, flecks, stream and path, `paintEdge` | banks reuse the stroke/stipple/fleck language and `paintEdge`; the stream becomes a pond bed painted in depth bands |
| `scene/props.ts` | puff-field trees and clouds, edge-hugging cloud drift | copied; plus stones and a jetty |
| `scene/details.ts` | instanced tufts and flowers coloured from the ground paint | tufts on the banks, plus instanced reeds and cattails |
| `sheep/sdf.ts`, `wool.ts` | ellipsoid/capsule SDFs, smooth min, surface nets with field AO; puff scatter over a base field | copied; used for koi, duck, frog |
| `sheep/geometry.worker.ts`, `geometryCache.ts` | build variants off-thread, serialize to transferables | generalised to creature kinds |
| `sheep/materials.ts` | `revealClip` brush sweep, `shadeIn` (flat → lit), wet edge, selection rim | shared creature paint: sweep *or* watercolour bloom, plus underwater tint |
| `sheep/pose.ts`, `behaviors.ts`, `controller.ts` | flat pose record, pure time functions, cross-fade from the pose actually shown, one-shots that return to a base | same shape for each creature; root motion lives in the controller |
| `interaction/*` | coalesced, smoothed stroke; analysis (bbox, closure, facing from a head bump, foot point); exact analytic raycast; pointer state machine with capture and second-finger cancel | adds a shape classifier and two surfaces (water plane, bank height) |
| `app/MeadowApp.ts` | all commands; size from drawing clamped ±15%; rotation bursts coalesce into one undo step | `PondApp`, per-kind actions |
| `state/*` | immutable versioned document, untrusted-input validation, 100-step history, debounced autosave | `{ version: 1, creatures: [...] }` |
| `capture/recorder.ts` | 2D-canvas composite of WebGL + SVG ink, MP4/H.264 else WebM | copied |
| `scripts/*.mjs`, Playwright | `--use-angle=metal`; stepping `engine.tick` by hand for deterministic strips; perf with `gl.finish` + readPixels sync | copied and adapted |

## Lessons MEADOW learned the hard way (and POND keeps)

- Colour: `THREE.Color('#hex')` is stored linear; GLSL literals go through `srgb()`.
- Forming creatures must be pickable, or a click on one starts a new stroke.
- Shadow layer enabled only after reveal progress > 0.6.
- The recorder must draw the SVG ink itself.
- Close-ups catch problems wide shots hide: purple shade, buried faces.
- Benchmark back-to-back frames with a GPU sync and report the machine load.
