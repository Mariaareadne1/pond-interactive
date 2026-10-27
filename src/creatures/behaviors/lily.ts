import { emptyPose, LILY_KEYS, ramp, ring, type LilyKey, type Pose } from '../pose';

/**
 * Lily pad behaviours: a gentle resting bob, a bob-and-tilt when something
 * touches it, a slow drift on the current, and the flower opening or closing.
 */

export const DRIFT = { duration: 9, distance: 1.4, spin: 0.7 } as const;
export const BLOOM_TIME = 2.2;

/** Fraction of the drift travelled by time t (eases in and settles). */
export function driftTravel(t: number): number {
  return ramp(t, 0, DRIFT.duration);
}

export interface LilyInputs {
  t: number;
  seed: number;
  /** Seconds since the last touch, and its strength and direction. */
  sinceTouch: number;
  touch: number;
  touchDir: number;
  /** Flower openness 0..1 (already eased by the controller). */
  open: number;
  /** Extra slow turn from a breeze. */
  breeze: number;
}

export function lilyPose(i: LilyInputs): Pose<LilyKey> {
  const p = emptyPose(LILY_KEYS);
  p.bob = 0.006 * Math.sin(i.t * 1.3 + i.seed) - 0.05 * i.touch * ring(i.sinceTouch, 7, 2.6);
  p.tilt = 0.012 * Math.sin(i.t * 0.9 + i.seed * 2) + 0.12 * i.touch * Math.abs(ring(i.sinceTouch, 6, 2.4));
  p.tiltDir = i.touch > 0 ? i.touchDir : i.seed;
  p.open = i.open;
  p.spin = 0.03 * Math.sin(i.t * 0.21 + i.seed) + 0.25 * i.breeze * Math.sin(i.t * 0.4 + i.seed);
  return p;
}
