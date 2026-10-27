import * as THREE from 'three';
import { meshSDF, sdCapsule, sdEllipsoid, smin, type SDF } from '../sdf';

/**
 * Procedural creature shapes, in each creature's own frame: x forward (the
 * nose), y up, z to its right, about one unit long. Bodies are smooth
 * signed-distance unions meshed with surface nets (soft and round, like
 * MEADOW's fleece and trees); fins, petals and pads are flat shapes.
 * These run in a Web Worker, so they must stay free of DOM and WebGL.
 */

export interface CreatureGeometries {
  [part: string]: THREE.BufferGeometry;
}

const mesh = (sdf: SDF, min: [number, number, number], max: [number, number, number], cell: number) =>
  meshSDF(sdf, { min, max, cell, ao: true });

// --- fish ---------------------------------------------------------------------

/** A koi's (or a slimmer minnow's) body, eyes and fins. Tail toward -x. */
export function fishShapes(slim: boolean): CreatureGeometries {
  const w = slim ? 0.78 : 1;
  const body: SDF = (x, y, z) => {
    let d = sdEllipsoid(x, y, z, 0.12, 0.0, 0, 0.32, 0.12, 0.15 * w);
    d = smin(d, sdEllipsoid(x, y, z, 0.33, 0.0, 0, 0.17, 0.1, 0.12 * w), 0.08);
    d = smin(d, sdEllipsoid(x, y, z, -0.2, 0.0, 0, 0.24, 0.075, 0.075 * w), 0.1);
    // a soft ridge along the back so the body isn't a pill from above
    d = smin(d, sdEllipsoid(x, y, z, 0.05, 0.05, 0, 0.26, 0.07, 0.07 * w), 0.05);
    return d;
  };
  const eye = new THREE.SphereGeometry(0.03, 14, 10);
  return {
    body: mesh(body, [-0.48, -0.17, -0.2], [0.55, 0.17, 0.2], 0.0125),
    eye,
    tail: tailFin(slim),
    pectoral: pectoralFin(),
    dorsal: dorsalFin(),
  };
}

/** A flowing horizontal tail fan with soft lobes; its root at x = 0. */
function tailFin(slim: boolean): THREE.BufferGeometry {
  const len = slim ? 0.26 : 0.4;
  const spread = slim ? 0.2 : 0.3;
  const shape = new THREE.Shape();
  shape.moveTo(0.02, 0);
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (t - 0.5) * 2; // -1 .. 1 across the fan
    // two lobes with a soft notch in the middle
    const reach = len * (0.78 + 0.22 * Math.abs(a) - 0.18 * Math.exp(-a * a * 12));
    shape.lineTo(-reach * (0.6 + 0.4 * Math.cos(a * 0.6)), a * spread);
  }
  shape.lineTo(0.02, 0);
  return flat(shape, 18);
}

function pectoralFin(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(-0.02, 0.16, -0.14, 0.17);
  s.quadraticCurveTo(-0.12, 0.06, 0, 0);
  return flat(s, 10);
}

function dorsalFin(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.16, 0);
  s.quadraticCurveTo(0.05, 0.08, -0.14, 0.05);
  s.lineTo(-0.2, 0);
  s.lineTo(0.16, 0);
  // stands upright along the back: the shape's y is already world up
  const g = new THREE.ShapeGeometry(s, 10);
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(1), 1));
  return g;
}

/** A flat shape lying in the x-z plane (shape y -> +z), with `aU` = distance from its root. */
function flat(shape: THREE.Shape, segments: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, segments);
  g.rotateX(Math.PI / 2);
  const pos = g.getAttribute('position');
  const ao = new Float32Array(pos.count).fill(1);
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  g.computeVertexNormals();
  return g;
}

// --- duck ---------------------------------------------------------------------

/** A round, buoyant duck. Waterline at y = 0; body, head, bill, wings and feet. */
export function duckShapes(): CreatureGeometries {
  // a boat-shaped body: round chest, flat-ish keel, rising to a perky tail
  const body: SDF = (x, y, z) => {
    let d = sdEllipsoid(x, y, z, -0.02, 0.07, 0, 0.37, 0.16, 0.235);
    d = smin(d, sdEllipsoid(x, y, z, 0.17, 0.09, 0, 0.19, 0.16, 0.2), 0.12);
    // the tail lifts out of the water, pointing up and back
    const tx = x + 0.33, ty = y - 0.16;
    const c = Math.cos(0.55), s = Math.sin(0.55);
    d = smin(d, sdEllipsoid(tx * c + ty * s, -tx * s + ty * c, z, 0, 0, 0, 0.13, 0.05, 0.085), 0.08);
    // a few soft feather swells so the outline isn't a pill
    d -= 0.006 * Math.sin(x * 38 + 1.2) * Math.sin(z * 31);
    return d;
  };
  const head: SDF = (x, y, z) => {
    let d = sdEllipsoid(x, y, z, 0.0, 0.0, 0, 0.12, 0.11, 0.105);
    d = smin(d, sdCapsule(x, y, z, -0.05, -0.22, 0, -0.015, -0.05, 0, 0.062), 0.06);
    // a slightly fuller crown and cheeks
    d = smin(d, sdEllipsoid(x, y, z, 0.025, -0.02, 0, 0.09, 0.08, 0.11), 0.04);
    return d;
  };
  const bill: SDF = (x, y, z) => smin(sdEllipsoid(x, y, z, 0.085, -0.005, 0, 0.1, 0.026, 0.052), sdEllipsoid(x, y, z, 0.01, 0.01, 0, 0.05, 0.034, 0.05), 0.03);
  const wing: SDF = (x, y, z) => smin(sdEllipsoid(x, y, z, -0.13, 0, 0.0, 0.22, 0.032, 0.11), sdEllipsoid(x, y, z, -0.31, -0.004, 0.0, 0.08, 0.022, 0.06), 0.04);
  const foot = new THREE.Shape();
  foot.moveTo(0, 0);
  foot.lineTo(0.09, -0.06);
  foot.quadraticCurveTo(0.11, 0, 0.09, 0.06);
  foot.lineTo(0, 0);
  return {
    body: mesh(body, [-0.52, -0.12, -0.28], [0.4, 0.3, 0.28], 0.012),
    head: mesh(head, [-0.14, -0.3, -0.14], [0.15, 0.13, 0.14], 0.009),
    bill: mesh(bill, [-0.05, -0.05, -0.07], [0.2, 0.05, 0.07], 0.006),
    wing: mesh(wing, [-0.42, -0.06, -0.12], [0.1, 0.06, 0.12], 0.008),
    eye: new THREE.SphereGeometry(0.02, 12, 8),
    foot: flat(foot, 4),
  };
}

// --- frog ---------------------------------------------------------------------

/** A squat, big-eyed frog sitting like a dumpling. Feet at y = 0. */
export function frogShapes(): CreatureGeometries {
  const body: SDF = (x, y, z) => {
    let d = sdEllipsoid(x, y, z, -0.05, 0.19, 0, 0.3, 0.19, 0.27);
    d = smin(d, sdEllipsoid(x, y, z, 0.17, 0.2, 0, 0.21, 0.15, 0.25), 0.1);
    // eye bumps sit proud of the head so the face reads from above
    for (const s of [-1, 1]) d = smin(d, sdEllipsoid(x, y, z, 0.2, 0.31, 0.12 * s, 0.085, 0.08, 0.085), 0.05);
    return d;
  };
  const thigh: SDF = (x, y, z) => smin(sdEllipsoid(x, y, z, 0.02, 0, 0, 0.19, 0.09, 0.1), sdEllipsoid(x, y, z, 0.12, -0.07, 0.03, 0.15, 0.04, 0.08), 0.05);
  const arm: SDF = (x, y, z) => smin(sdCapsule(x, y, z, 0, 0, 0, 0.03, -0.13, 0.02, 0.035), sdEllipsoid(x, y, z, 0.06, -0.14, 0.03, 0.06, 0.02, 0.05), 0.03);
  return {
    body: mesh(body, [-0.4, -0.02, -0.32], [0.42, 0.42, 0.32], 0.011),
    thigh: mesh(thigh, [-0.2, -0.14, -0.14], [0.3, 0.12, 0.14], 0.009),
    arm: mesh(arm, [-0.06, -0.19, -0.08], [0.14, 0.06, 0.1], 0.007),
    eye: new THREE.SphereGeometry(0.068, 18, 12),
    throat: new THREE.SphereGeometry(0.1, 16, 10),
    tongue: new THREE.CapsuleGeometry(0.022, 0.4, 4, 8).rotateZ(-Math.PI / 2).translate(0.22, 0, 0),
  };
}

// --- lily pad and flower ------------------------------------------------------

/** A notched, gently domed pad, radius 0.5, the notch toward +x. `aU` = radius, `aV` = angle. */
export function lilyShapes(): CreatureGeometries {
  const RINGS = 10;
  const SEG = 48;
  const notch = 0.22;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [0];
  pos.push(0, 0.03, 0);
  uv.push(0, 0);
  index.length = 0;
  for (let r = 1; r <= RINGS; r++) {
    const rad = (r / RINGS) * 0.5;
    for (let s = 0; s <= SEG; s++) {
      const a = notch / 2 + (s / SEG) * (Math.PI * 2 - notch);
      const wob = 1 + 0.025 * Math.sin(a * 5 + 1.3) * (r / RINGS);
      // domed in the middle, the rim curling up a touch
      const y = 0.03 * (1 - (rad / 0.5) ** 2) + 0.02 * Math.max(0, rad / 0.5 - 0.88) / 0.12;
      pos.push(Math.cos(a) * rad * wob, y, -Math.sin(a) * rad * wob);
      uv.push(rad / 0.5, a);
    }
  }
  const ring = (r: number, s: number) => (r === 0 ? 0 : 1 + (r - 1) * (SEG + 1) + s);
  for (let s = 0; s < SEG; s++) index.push(0, ring(1, s), ring(1, s + 1));
  for (let r = 1; r < RINGS; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s), d = ring(r + 1, s + 1);
      index.push(a, c, b, b, c, d);
    }
  }
  const pad = new THREE.BufferGeometry();
  pad.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pad.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  pad.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  pad.setIndex(index);
  pad.computeVertexNormals();

  // a spoon-shaped petal, root at the origin, growing along +x and cupped
  const petal = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  petal.scale(0.11, 0.035, 0.045);
  petal.rotateZ(Math.PI); // cup facing up
  petal.translate(0.1, 0.03, 0);
  petal.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(petal.getAttribute('position').count).fill(1), 1));
  const centre = new THREE.CylinderGeometry(0.045, 0.035, 0.05, 14);
  centre.translate(0, 0.03, 0);
  centre.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(centre.getAttribute('position').count).fill(1), 1));
  return { pad, petal, centre };
}

/** Every shape, by kind, built in one go (in the worker). */
export function buildAllShapes(): Record<string, CreatureGeometries> {
  return {
    koi: fishShapes(false),
    minnow: fishShapes(true),
    duck: duckShapes(),
    frog: frogShapes(),
    lily: lilyShapes(),
  };
}
