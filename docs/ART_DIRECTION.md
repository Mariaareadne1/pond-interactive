# POND — art direction

POND is MEADOW's sibling: the same hand, a new world. Where MEADOW is a tile of
fields with sheep, POND is a small round pond seen from above at a
three-quarter angle, floating as a painted tile on warm paper.

## What carries over from MEADOW unchanged

- **Tile on paper.** A rounded rectangle of painted landscape on `#f4efe4`,
  ending in the same roughened dry-brush edge (`paintEdge`) where the paint
  thins and breaks into specks.
- **One painted light.** `paintLight`: warm lit side, cool lavender shade
  (`uShadeColor ≈ #bdb9e3`); the sun high, upper-left and a little in front,
  so what the camera sees is lit and shadows fall to the lower right. Every
  caster (creatures, reeds, trees, clouds) goes into the one sun shadow map
  with the contact-hardening filter (`castLight`).
- **Gouache marks.** Flat-ish colour fields with soft internal gradients,
  long dry-brush strokes, a fine pigment stipple, pale flecks. No photoreal
  textures, no gloss, nothing black.
- **Characters larger than life.** The tile is a miniature; creatures are the
  toys. A koi or a duck is at least ~60 px long at 1440 × 900.
- **Interface.** Inter Tight + Fraunces, the wordmark top-left
  ("POND / *a place to draw fish*"), the cream pill toolbar, the thin blue
  selection box with a world-unit label and a contextual action bar.

## What is new

**Water is paint, not physics.** The pond bed is painted in depth bands — a
pale sandy rim, clear turquoise-green, a deeper teal-blue centre (never neon
blue) — so the colour you see *is* the water. Over it a thin surface layer
adds what a watercolourist would: soft white highlights, a hint of reflected
sky, slow drifting light streaks, a darker wet line where water meets bank,
and ripple rings that spread from anything touching the surface. Things below
the surface are tinted toward the water's colour and softened with depth.

**Banks** are fresh and yellow-greens with a few darker reed greens, a
sandy shore line, dry-brush strokes and stipple like MEADOW's fields.

**Small environmental details:** instanced reeds and cattails at the edges
that sway (and lean in a breeze), a few smooth stones, a little wooden jetty,
lily clusters, drifting petals, a dragonfly zipping between reeds, pond
skaters dimpling the surface. Two puffy trees and clouds that drift along the
tile's edges and never park over the middle.

## Creatures

All procedural: puff-field signed-distance shapes meshed with surface nets
in a Web Worker (as MEADOW's fleece and trees), flat shapes for pads and
petals, painted in custom shaders. No eyes-as-emoji, no googly eyes, no
outlines: small dark eyes with a single catchlight, as MEADOW's sheep.

| | Palette | Character |
|---|---|---|
| **Koi** | cream, persimmon orange patches, a few charcoal spots | long, soft, a flowing tail; glides in unhurried S-curves |
| **Minnow** | silver-sage with a pale belly | small and quick |
| **Duck** | cream and warm brown, soft orange bill and feet | round, buoyant, a little upturned tail |
| **Lily pad** | deep sage with paler veins; flowers cream with pink tips | a notched disc that bobs when touched |
| **Frog** | fresh green with a cream belly and throat | squat, big-eyed, sits like a dumpling |

## The reveal, for water

The pen line lingers as a ghost; a drop of pigment **blooms outward like
watercolour** from the stroke's centre — a soft, irregular edge that is a
little darker where the paint pools — filling the creature's silhouette, flat
first, then light and shade arrive. A ring spreads across the water. On land
and lily pads, MEADOW's brush-stroke sweep from tail to nose. The shadow only
arrives once ~60% of the creature is painted.

## Things to avoid (MEADOW's lessons)

- `new THREE.Color('#hex')` is already linear — never convert it again.
- Shade that is too saturated reads purple: keep creature shade gentle.
- Faces disappear inside body puffs: eyes sit proud of the head.
- Shadows must not arrive before the creature.
