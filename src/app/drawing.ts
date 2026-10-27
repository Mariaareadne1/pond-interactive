import type { PondApp } from './PondApp';
import type { DrawKind } from '../state/store';
import { newId, newSeed, placeFor, SIZE_MAX, SIZE_MIN, type CreatureRecord } from '../state/document';
import type { Pt, StrokeAnalysis } from '../interaction/stroke';
import { screenToGround, screenToWater } from '../interaction/rays';
import { classifyWater, facingFor, measureShape, type ShapeFeatures } from '../interaction/shape';
import { clampToBank, pondSDF } from '../scene/pondShape';
import { BODY_LENGTH, KIND_LABEL, MINNOW_SCALE, type Kind } from '../creatures/types';

/**
 * Turning a finished drawing into a creature record: where it was drawn
 * (water, bank or a lily pad) and its shape decide the kind; the drawing
 * sets only position, size (clamped ±15%), facing and kind — never the
 * geometry — so a bad drawing still makes a good creature.
 */

export type Draft =
  | { record: CreatureRecord; confident: boolean; alternatives: Kind[] }
  | { message: string };

/** Drawn this much smaller than a koi, a fish becomes a minnow. */
const MINNOW_BELOW = 0.72;

const MESSAGES = {
  paper: 'Draw on the pond or its banks.',
  waterOnLand: (k: Kind) => `${KIND_LABEL[k]}s need water — draw it on the pond.`,
  frogInDeep: 'Frogs like the bank or a lily pad — not deep water.',
};

const headingFromScreen = (app: PondApp, centre: Pt, dir: Pt, y: 'water' | 'ground'): number | null => {
  const at = (p: Pt) => (y === 'water' ? screenToWater : screenToGround)(app.engine.camera, app.rect, p.x, p.y);
  const a = at(centre);
  const b = at({ x: centre.x + dir.x * 30, y: centre.y + dir.y * 30 });
  return a && b ? Math.atan2(-(b.z - a.z), b.x - a.x) : null;
};

/** World length (m) of the drawing along its own axis, measured on the water plane or the ground. */
function worldExtent(app: PondApp, f: ShapeFeatures, along: number, surface: 'water' | 'ground'): number {
  const cast = surface === 'water' ? screenToWater : screenToGround;
  const half = along / 2;
  const a = cast(app.engine.camera, app.rect, f.centre.x - f.axis.x * half, f.centre.y - f.axis.y * half);
  const b = cast(app.engine.camera, app.rect, f.centre.x + f.axis.x * half, f.centre.y + f.axis.y * half);
  return a && b ? a.distanceTo(b) : 0;
}

const clampSize = (s: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number.isFinite(s) ? s : 1));

export function draft(app: PondApp, points: readonly Pt[], a: StrokeAnalysis, drawKind: DrawKind): Draft {
  const f = measureShape(points);
  const hit = app.surfaceAt(f.centre.x, f.centre.y);
  const footHit = app.surfaceAt(a.foot.x, a.foot.y);
  const where = hit.surface !== 'paper' ? hit : footHit;
  if (where.surface === 'paper') return { message: MESSAGES.paper };
  const pad = where.surface === 'water' ? app.pond.padAt(where.point.x, where.point.z, 0.15) : null;

  // what is it?
  let kind: Kind;
  let confident = true;
  let alternatives: Kind[] = [];
  const onLand = where.surface === 'bank' || !!pad;
  if (drawKind !== 'auto') kind = drawKind;
  else if (onLand) {
    kind = 'frog';
    // a big loop on a pad might have meant another pad, or something swimming under it
    if (pad && f.length > 160) {
      confident = false;
      alternatives = ['lily', 'fish'];
    }
  } else {
    const c = classifyWater(f);
    kind = c.kind;
    confident = c.confident;
    alternatives = c.alternatives;
  }

  // where exactly, and is it somewhere it can live?
  let x = where.point.x;
  let z = where.point.z;
  let perch: string | undefined;
  if (kind === 'frog') {
    if (pad) {
      perch = pad.id;
      x = pad.x + (where.point.x - pad.x) * 0.3;
      z = pad.z + (where.point.z - pad.z) * 0.3;
    } else if (where.surface === 'bank') {
      const g = screenToGround(app.engine.camera, app.rect, a.foot.x, a.foot.y) ?? where.point;
      [x, z] = clampToBank(g.x, g.z);
    } else {
      const near = app.pond.padAt(x, z, 1.0);
      if (near && !app.pond.sense.padTaken(near.id, '')) {
        perch = near.id;
        x = near.x;
        z = near.z;
      } else if (pondSDF(x, z) > -1.2) [x, z] = clampToBank(x, z);
      else return { message: MESSAGES.frogInDeep };
    }
  } else {
    if (where.surface === 'bank') {
      // just over the edge of the water: nudge in; well up the bank: not here
      if (pondSDF(x, z) > 1.3) return { message: MESSAGES.waterOnLand(kind) };
    }
    [x, z] = placeFor(kind, x, z);
  }

  // how big, and which way it faces
  const surface = kind === 'frog' && !pad ? 'ground' : 'water';
  const along = kind === 'lily' ? Math.max(f.length, f.width) : f.length;
  const drawn = worldExtent(app, f, along, surface);
  let minnow = false;
  let size: number;
  if (kind === 'fish') {
    minnow = drawn < BODY_LENGTH.fish * MINNOW_BELOW;
    size = clampSize(drawn / (BODY_LENGTH.fish * (minnow ? MINNOW_SCALE : 1)));
  } else size = clampSize(drawn / BODY_LENGTH[kind]);
  const seed = newSeed();
  const facing = facingFor(kind, f);
  let heading = headingFromScreen(app, f.centre, facing, surface) ?? 0;
  if (kind === 'lily') heading = (seed % 628) / 100;
  heading += (Math.random() - 0.5) * 0.15;

  const record: CreatureRecord = {
    id: newId(kind),
    kind,
    x,
    z,
    heading: Math.atan2(Math.sin(heading), Math.cos(heading)),
    seed,
    size,
    ...(kind === 'fish' ? { pattern: seed % 4, ...(minnow ? { minnow: true } : {}) } : {}),
    ...(kind === 'lily' ? { flower: seed % 5 < 2 ? ('bud' as const) : seed % 5 === 2 ? ('open' as const) : ('none' as const) } : {}),
    ...(perch ? { perch } : {}),
  };
  return { record, confident, alternatives };
}

