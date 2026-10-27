import { noise2 } from '../../scene/noise';
import { emptyPose, FISH_KEYS, pulse, ramp, TAU, type FishKey, type Pose } from '../pose';

/**
 * Fish behaviours: pure functions of time-in-state. Root motion (where the
 * fish goes) lives in the controller; these say how its body moves, and for
 * the leap, the arc it follows.
 */

export type FishState = 'swim' | 'come' | 'nose' | 'hide' | 'leap' | 'school' | 'feed';

/** Cruising depth below the surface (m, at size 1); deeper when hiding. */
export const SWIM_DEPTH = 0.3;
export const HIDE_DEPTH = 0.62;

const wob = (t: number, seed: number, lane: number) => noise2(t, seed * 13.7 + lane * 31.1);

/** Unhurried gliding: tail-driven undulation that swells and eases, small fin flutters. */
export function swimPose(t: number, seed: number, effort = 0.5): Pose<FishKey> {
  const p = emptyPose(FISH_KEYS);
  // glide-and-kick: a few strong beats, then a coast
  const kick = 0.55 + 0.45 * Math.max(0, wob(t * 0.35, seed, 1));
  p.amp = (0.045 + 0.05 * effort) * kick;
  p.rate = 5.5 + 5 * effort;
  p.fin = 0.5 + 0.5 * Math.sin(t * 3.1 + seed) * (1 - effort * 0.5);
  p.roll = 0.05 * wob(t * 0.4, seed, 2);
  p.pitch = 0.04 * wob(t * 0.3, seed, 3);
  p.sink = 0.06 * wob(t * 0.2, seed, 4);
  return p;
}

/** Rising to nose the surface: a slow lift of the head, little mouthing tugs. */
export function nosePose(t: number, seed: number): Pose<FishKey> {
  const p = swimPose(t, seed, 0.1);
  const up = ramp(t, 0, 0.5) * (1 - ramp(t, 1.3, 1.7));
  p.sink = -SWIM_DEPTH * 0.8 * up;
  p.pitch = 0.22 * up + 0.05 * Math.sin(t * 9) * up;
  p.amp *= 0.5;
  return p;
}

/** Resting deep under a pad: barely moving, fins fanning. */
export function hidePose(t: number, seed: number): Pose<FishKey> {
  const p = swimPose(t, seed, 0);
  p.amp = 0.02 + 0.01 * Math.sin(t * 0.7);
  p.rate = 3;
  p.sink = 0; // the controller sinks it under the pad
  p.fin = 0.5 + 0.5 * Math.sin(t * 4 + seed);
  return p;
}

export const LEAP = {
  duration: 2.0,
  diveEnd: 0.5,
  launch: 0.62,
  reentry: 1.32,
  /** Forward travel over the whole leap (m, at size 1). */
  travel: 2.8,
  /** Apex height of the body above the surface (m, at size 1). */
  height: 1.05,
} as const;

/** Forward distance travelled by time t of a leap (size 1). Monotonic, 0 → LEAP.travel. */
export function leapTravel(t: number): number {
  const u = Math.min(1, Math.max(0, t / LEAP.duration));
  // slow in the dive, fast through the air, easing after re-entry
  let s: number;
  if (u < 0.25) s = 0.1 * (u / 0.25) ** 2;
  else if (u < 0.66) s = 0.1 + (0.75 * (u - 0.25)) / 0.41;
  else s = 0.85 + 0.15 * (1 - (1 - (u - 0.66) / 0.34) ** 2);
  return s * LEAP.travel;
}

/** Height of the fish's centre relative to the surface (negative = under water), size 1. */
export function leapHeight(t: number): number {
  const T = LEAP;
  if (t < T.diveEnd) return -SWIM_DEPTH - 0.25 * ramp(t, 0, T.diveEnd);
  if (t < T.launch) return -(SWIM_DEPTH + 0.25) * (1 - ramp(t, T.diveEnd, T.launch));
  if (t < T.reentry) {
    const u = (t - T.launch) / (T.reentry - T.launch);
    return T.height * 4 * u * (1 - u);
  }
  const back = ramp(t, T.reentry, T.duration);
  return -SWIM_DEPTH * back - 0.2 * Math.sin(back * Math.PI);
}

/**
 * A leap: anticipation dive (nose down, tail kicking hard), a burst up,
 * a bright arc through the air (stretched on the way up, curled at the apex,
 * stretched again diving in), re-entry, and a glide back to cruising depth.
 */
export function leapPose(t: number, seed: number): Pose<FishKey> {
  const p = swimPose(t, seed, 1);
  const T = LEAP;
  p.rate = 14;
  if (t < T.diveEnd) {
    const a = ramp(t, 0, T.diveEnd);
    p.pitch = -0.35 * a;
    p.amp = 0.06 + 0.08 * a;
    p.squash = 0.12 * a; // gathering, short and thick
  } else if (t < T.launch) {
    const a = ramp(t, T.diveEnd, T.launch);
    p.pitch = -0.35 + 1.25 * a;
    p.squash = 0.12 - 0.3 * a; // burst: stretch long
    p.amp = 0.14;
  } else if (t < T.reentry) {
    const u = (t - T.launch) / (T.reentry - T.launch);
    // the body follows the arc's tangent, from nose-up to nose-down
    p.pitch = 0.9 - 1.9 * u;
    // stretched leaving, a round curl at the apex, stretched diving in
    p.squash = -0.16 + 0.26 * Math.sin(u * Math.PI) - 0.1 * Math.max(0, u - 0.75) * 4;
    p.turn = 0.9 * Math.sin(u * Math.PI) * (seed % 2 ? 1 : -1);
    p.amp = 0.03;
    p.rate = 6;
    p.fin = 1;
  } else {
    const a = ramp(t, T.reentry, T.duration);
    p.pitch = -0.6 * (1 - a);
    p.squash = 0.1 * Math.sin(a * Math.PI) * (1 - a);
    p.amp = 0.1 * (1 - a) + 0.05;
  }
  p.sink = 0;
  p.lift = 0; // the controller places the body on leapHeight directly
  return p;
}

/** A fish's playful wiggle when food lands nearby: quicker beats, small darts. */
export function feedPose(t: number, seed: number): Pose<FishKey> {
  const p = swimPose(t, seed, 0.8);
  p.sink = -SWIM_DEPTH * 0.55;
  p.pitch = 0.12 + 0.08 * pulse(t, seed, 0.9, 0.12, 5);
  return p;
}

export function fishPose(state: FishState, t: number, seed: number): Pose<FishKey> {
  switch (state) {
    case 'nose': return nosePose(t, seed);
    case 'hide': return hidePose(t, seed);
    case 'leap': return leapPose(t, seed);
    case 'feed': return feedPose(t, seed);
    case 'come': return swimPose(t, seed, 0.9);
    case 'school': return swimPose(t, seed, 0.7);
    default: return swimPose(t, seed, 0.4);
  }
}

export const FISH_TAU = TAU;
