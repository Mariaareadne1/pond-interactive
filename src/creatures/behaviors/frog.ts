import { noise2 } from '../../scene/noise';
import { emptyPose, FROG_KEYS, pulse, ramp, ring, window4, type FrogKey, type Pose } from '../pose';

/** Frog behaviours: pure functions of time-in-state returning a pose. */

export type FrogState = 'sit' | 'hop' | 'catch' | 'croak' | 'lookUp';

const wob = (t: number, seed: number, lane: number) => noise2(t, seed * 17.3 + lane * 23.9);

/** Sitting: a pulsing throat, blinks, an occasional look around. */
export function sitPose(t: number, seed: number): Pose<FrogKey> {
  const p = emptyPose(FROG_KEYS);
  p.throat = Math.sin(t * 5.2 + seed) * 0.5 + 0.5;
  p.blink = pulse(t, seed, 3.1, 0.06, 1);
  p.headYaw = 0.35 * wob(t * 0.15, seed, 2) + 0.3 * pulse(t, seed, 6.3, 0.6, 3) * Math.sign(wob(t * 0.1, seed, 4) || 1);
  // a little settle of the body now and then, as if shifting its weight
  p.squash = 0.04 * pulse(t, seed, 5.7, 0.25, 5) + 0.01 * Math.sin(t * 5.2 + seed);
  return p;
}

export const HOP = {
  duration: 1.2,
  crouchEnd: 0.28,
  launch: 0.36,
  land: 0.86,
} as const;

/** Fraction of the way to the target by time t (0 until launch, 1 from landing). */
export function hopTravel(t: number): number {
  const u = Math.min(1, Math.max(0, (t - HOP.launch) / (HOP.land - HOP.launch)));
  return u;
}

/** Height above the straight line between start and target (m, at size 1 for a 1 m hop). */
export function hopHeight(t: number, distance: number): number {
  const u = (t - HOP.launch) / (HOP.land - HOP.launch);
  if (u <= 0 || u >= 1) return 0;
  return (0.35 + 0.18 * Math.min(4, distance)) * 4 * u * (1 - u);
}

/** Anticipation squash, a stretched leap with legs straight out, a squash landing, a settle. */
export function hopPose(t: number, seed: number): Pose<FrogKey> {
  const p = sitPose(t, seed);
  const H = HOP;
  const crouch = window4(t, 0, H.crouchEnd, H.crouchEnd, H.launch);
  const air = window4(t, H.launch - 0.04, H.launch + 0.06, H.land - 0.1, H.land);
  p.squash = 0.22 * crouch - 0.26 * air * (1 - 0.6 * Math.sin(((t - H.launch) / (H.land - H.launch)) * Math.PI)) + 0.24 * ring(t - H.land, 11, 6);
  p.hind = Math.min(1, air * 1.1);
  p.front = -0.6 * air;
  p.pitch = 0.35 * window4(t, H.launch - 0.05, H.launch + 0.05, H.launch + 0.2, H.land - 0.15) - 0.3 * window4(t, H.land - 0.2, H.land - 0.1, H.land, H.land + 0.08) - 0.12 * crouch;
  p.blink = Math.max(p.blink, 0.6 * window4(t, H.land - 0.05, H.land, H.land + 0.08, H.land + 0.2));
  p.throat = 0;
  return p;
}

export const CATCH = { duration: 2.8, flick: 1.95 } as const;

/** Watching a fly circle, then a quick, tidy flick of the tongue and a satisfied gulp. */
export function catchPose(t: number, seed: number): Pose<FrogKey> {
  const p = sitPose(t, seed);
  // eyes and head follow the fly
  p.headYaw = 0.45 * Math.sin(t * 3.2) * (1 - ramp(t, CATCH.flick - 0.3, CATCH.flick));
  p.lookUp = 0.6 * window4(t, 0.2, 0.6, CATCH.flick - 0.1, CATCH.flick + 0.3);
  p.squash = 0.06 * window4(t, CATCH.flick - 0.35, CATCH.flick - 0.15, CATCH.flick, CATCH.flick + 0.05);
  const f = t - CATCH.flick;
  p.tongue = f < 0 ? 0 : f < 0.09 ? f / 0.09 : f < 0.22 ? 1 - (f - 0.09) / 0.13 : 0;
  // gulp, then a slow happy blink
  p.throat = 1.5 * window4(t, CATCH.flick + 0.25, CATCH.flick + 0.32, CATCH.flick + 0.45, CATCH.flick + 0.6);
  p.blink = Math.max(p.blink, window4(t, CATCH.flick + 0.45, CATCH.flick + 0.55, CATCH.flick + 0.7, CATCH.flick + 0.8));
  return p;
}

export const CROAK = { duration: 2.3 } as const;

/** Two croaks: the throat swells into a round balloon, the body lifts a little each time. */
export function croakPose(t: number, seed: number): Pose<FrogKey> {
  const p = sitPose(t, seed);
  const one = window4(t, 0.15, 0.35, 0.6, 0.8);
  const two = window4(t, 1.05, 1.22, 1.5, 1.75);
  p.croak = Math.max(one, two * 0.85);
  p.squash = -0.06 * p.croak;
  p.lookUp = 0.25 * p.croak;
  p.throat = 0;
  return p;
}

/** Looking up at the rain, blinking at the drops. */
export function lookUpPose(t: number, seed: number): Pose<FrogKey> {
  const p = sitPose(t, seed);
  p.lookUp = 0.7 * ramp(t, 0, 0.6);
  p.blink = Math.max(p.blink, pulse(t, seed + 3, 1.3, 0.07, 9));
  return p;
}

export function frogPose(state: FrogState, t: number, seed: number): Pose<FrogKey> {
  switch (state) {
    case 'hop': return hopPose(t, seed);
    case 'catch': return catchPose(t, seed);
    case 'croak': return croakPose(t, seed);
    case 'lookUp': return lookUpPose(t, seed);
    default: return sitPose(t, seed);
  }
}
