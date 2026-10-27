import type { Pt } from './stroke';
import type { Kind } from '../creatures/types';

/**
 * Reading a loose doodle with a few robust measurements rather than a
 * classifier: how elongated it is along its own main axis, whether one end
 * carries a bump on top (a duck's head), whether there is a notch at one end
 * (a fish's tail), and which end is fuller (a fish's head). Everything is in
 * screen pixels, y down.
 */

export interface ShapeFeatures {
  /** Length over width along the drawing's principal axis (≥ 1). */
  elongation: number;
  /** Unit vector of the principal axis, pointing toward the "front" end chosen below. */
  axis: Pt;
  /** Centre of the shape (mean of the outline, resampled evenly). */
  centre: Pt;
  /** Extent along / across the axis, px. */
  length: number;
  width: number;
  /** 0..1: how strongly one end rises above the rest of the top edge (a head bump). */
  headBump: number;
  /** -1 / 1: which screen side the bump is on (x), 0 when none. */
  bumpSide: -1 | 0 | 1;
  /** 0..1: deepest dent in the outline near an end of the axis (a tail notch), relative to width. */
  notch: number;
  /** Signed position of that notch along the axis (-1 back end .. 1 front end). */
  notchAt: number;
  /** Which way along the axis is fuller (+1 front of `axis` as computed before flipping). */
  fullerEnd: -1 | 1;
}

/** Resample a polyline to n points evenly spaced along its length (closing it). */
export function resample(pts: readonly Pt[], n: number): Pt[] {
  const loop = [...pts, pts[0]];
  let total = 0;
  for (let i = 1; i < loop.length; i++) total += Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y);
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = total / n;
  const out: Pt[] = [{ ...loop[0] }];
  let acc = 0;
  for (let i = 1; i < loop.length && out.length < n; i++) {
    const a = loop[i - 1];
    const b = loop[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    let start = a;
    while (acc + seg >= step && out.length < n) {
      const t = (step - acc) / seg;
      const p = { x: start.x + (b.x - start.x) * t, y: start.y + (b.y - start.y) * t };
      out.push(p);
      seg -= step - acc;
      start = p;
      acc = 0;
    }
    acc += seg;
  }
  while (out.length < n) out.push({ ...loop[loop.length - 1] });
  return out;
}

function hull(pts: readonly Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

export function measureShape(raw: readonly Pt[]): ShapeFeatures {
  const pts = resample(raw, 96);
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  // principal axis from the covariance of the outline
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ax = Math.cos(ang);
  let ay = Math.sin(ang);
  // prefer an axis pointing right (or down when vertical) so "front" is a stable choice
  if (ax < -1e-6 || (Math.abs(ax) < 1e-6 && ay < 0)) {
    ax = -ax;
    ay = -ay;
  }
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  const along: number[] = [];
  const across: number[] = [];
  for (const p of pts) {
    const a = (p.x - cx) * ax + (p.y - cy) * ay;
    const b = -(p.x - cx) * ay + (p.y - cy) * ax;
    along.push(a);
    across.push(b);
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }
  const length = Math.max(1, maxA - minA);
  const width = Math.max(1, maxB - minB);

  // fullness: width of the outline in the front third vs the back third
  const bandWidth = (lo: number, hi: number) => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const u = (along[i] - minA) / length;
      if (u >= lo && u <= hi) {
        mn = Math.min(mn, across[i]);
        mx = Math.max(mx, across[i]);
      }
    }
    return mx > mn ? mx - mn : 0;
  };
  const fullerEnd: -1 | 1 = bandWidth(0.62, 0.9) >= bandWidth(0.1, 0.38) ? 1 : -1;

  // head bump, in screen space: does one end of the top edge rise well above the middle?
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const W = Math.max(1, maxX - minX);
  const H = Math.max(1, maxY - minY);
  const topAt = (lo: number, hi: number) => {
    let top = Infinity;
    for (const p of pts) {
      const u = (p.x - minX) / W;
      if (u >= lo && u <= hi) top = Math.min(top, p.y);
    }
    return top;
  };
  const leftTop = topAt(0, 0.34);
  const midTop = topAt(0.4, 0.62);
  const rightTop = topAt(0.66, 1);
  const rise = (end: number, other: number) => Math.max(0, Math.min(midTop, other) - end) / H;
  const riseL = rise(leftTop, rightTop);
  const riseR = rise(rightTop, leftTop);
  const headBump = Math.min(1, Math.max(riseL, riseR) / 0.45);
  const bumpSide: -1 | 0 | 1 = headBump < 0.2 ? 0 : riseR > riseL ? 1 : -1;

  // tail notch: deepest concavity (outline point inside its hull, far from it) near an end of the axis
  const hp = hull(pts);
  let notch = 0;
  let notchAt = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let d = Infinity;
    for (let k = 0; k < hp.length; k++) d = Math.min(d, distToSegment(p, hp[k], hp[(k + 1) % hp.length]));
    const u = ((along[i] - minA) / length) * 2 - 1;
    if (Math.abs(u) < 0.25) continue;
    const depth = d / width;
    if (depth > notch) {
      notch = depth;
      notchAt = u;
    }
  }
  return { elongation: length / width, axis: { x: ax, y: ay }, centre: { x: cx, y: cy }, length, width, headBump, bumpSide, notch: Math.min(1, notch), notchAt, fullerEnd };
}

export interface Classification {
  kind: Kind;
  /** Other reasonable readings, best first (for "Make it a … instead"). */
  alternatives: Kind[];
  /** False when the reading was a close call. */
  confident: boolean;
  /** Screen direction the creature faces (unit), y down. */
  facing: Pt;
}

/**
 * Decide what a drawing on the water most likely is. Land drawings are
 * always frogs (nothing else lives there); a forced type always wins.
 */
export function classifyWater(f: ShapeFeatures): Classification {
  const duck = f.headBump * (f.elongation < 2.8 ? 1 : 0.4);
  const fishScore = Math.max(0, Math.min(1, (f.elongation - 1.45) / 0.8)) * 0.8 + Math.min(1, f.notch / 0.22) * 0.6;
  const lily = Math.max(0, 1 - (f.elongation - 1.0) / 0.6) * (1 - f.headBump * 0.8) * (1 - Math.min(1, f.notch / 0.3) * 0.5);
  const scores: [Kind, number][] = [
    ['duck', duck >= 0.55 ? duck + 0.3 : duck * 0.8],
    ['fish', fishScore],
    ['lily', lily],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  const kind = best[0];
  const confident = best[1] - second[1] > 0.25;
  return { kind, alternatives: scores.slice(1).filter(([, s]) => s > 0.15 || !confident).map(([k]) => k), confident, facing: facingFor(kind, f) };
}

/** The way a drawn creature faces on screen. */
export function facingFor(kind: Kind, f: ShapeFeatures): Pt {
  const ax = f.axis;
  if (kind === 'duck' && f.bumpSide !== 0) return { x: f.bumpSide, y: 0 };
  if (kind === 'fish') {
    // a notch at one end is the tail: face the other way; otherwise the fuller end is the head
    const sign = f.notch > 0.12 ? (f.notchAt > 0 ? -1 : 1) : f.fullerEnd;
    return { x: ax.x * sign, y: ax.y * sign };
  }
  if (kind === 'frog') return f.bumpSide !== 0 ? { x: f.bumpSide, y: 0.4 } : { x: ax.x * f.fullerEnd, y: 0.5 };
  return { x: ax.x, y: ax.y };
}
