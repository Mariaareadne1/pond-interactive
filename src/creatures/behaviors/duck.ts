import { noise2 } from '../../scene/noise';
import { DUCK_KEYS, emptyPose, pulse, ramp, ring, window4, type DuckKey, type Pose } from '../pose';

/**
 * Duck behaviours: pure functions of time-in-state returning a pose. The
 * flight path itself (where the duck is in the air) is also pure — a
 * function of time, start point, heading and loop centre — so it can be
 * tested and it always comes back down onto the water.
 */

export type DuckState = 'paddle' | 'dabble' | 'preen' | 'fly' | 'shake' | 'follow' | 'feed';

const wob = (t: number, seed: number, lane: number) => noise2(t, seed * 11.3 + lane * 29.9);

/** Shared life: bobbing on the water, blinks, look-arounds, a wagging tail. */
function life(p: Pose<DuckKey>, t: number, seed: number): void {
  p.bob = 0.012 * Math.sin(t * 2.1 + seed) + 0.006 * Math.sin(t * 3.7);
  p.blink = pulse(t, seed, 3.4, 0.07, 1);
  const look = wob(t * 0.18, seed, 2);
  p.headYaw = 0.5 * look + 0.25 * pulse(t, seed, 5.5, 0.4, 3) * Math.sign(look || 1);
  p.headPitch = 0.06 * wob(t * 0.3, seed, 4);
  p.headRoll = 0.12 * pulse(t, seed, 7.1, 0.5, 5);
  p.tail = 0.6 * pulse(t, seed, 4.3, 0.12, 6) * Math.sin(t * 30);
  p.roll = 0.03 * Math.sin(t * 1.6 + seed);
}

/** Drifting along, feet working alternately beneath the surface. */
export function paddlePose(t: number, seed: number, speed = 0.5): Pose<DuckKey> {
  const p = emptyPose(DUCK_KEYS);
  life(p, t, seed);
  p.paddle = t * (3 + 6 * speed);
  p.pitch = -0.03 * speed;
  return p;
}

export const DABBLE = { duration: 3.4 };

/** Tips forward until only the tail is in the air, wiggles, pops back up and shakes. */
export function dabblePose(t: number, seed: number): Pose<DuckKey> {
  const p = paddlePose(t, seed, 0.2);
  const down = window4(t, 0.25, 0.7, 2.0, 2.45);
  p.pitch = -1.25 * down;
  p.bob = -0.06 * down + p.bob;
  p.neck = -0.6 * down;
  p.headPitch = -0.4 * down;
  p.headYaw *= 1 - down;
  // tail up and wiggling while the head is under
  p.tail = down * (0.4 + 0.5 * Math.sin(t * 22) * window4(t, 0.8, 1.0, 1.7, 1.9));
  p.paddle = t * 14 * down + t * 4;
  // the pop back up overshoots a little, then a quick head shake
  p.pitch += 0.18 * ring(t - 2.45, 9, 4);
  p.headYaw += 0.5 * Math.sin((t - 2.6) * 30) * window4(t, 2.55, 2.65, 3.0, 3.2);
  p.squash = -0.06 * ring(t - 2.45, 12, 6);
  return p;
}

export const PREEN = { duration: 3.2 };

/** Turns its head back over its shoulder into its wing, nibbling. */
export function preenPose(t: number, seed: number): Pose<DuckKey> {
  const p = paddlePose(t, seed, 0);
  const side = seed % 2 ? 1 : -1;
  const back = window4(t, 0.2, 0.8, 2.4, 2.9);
  p.headYaw = side * 2.4 * back + p.headYaw * (1 - back);
  p.neck = -0.35 * back;
  p.headPitch = -0.5 * back + 0.12 * Math.sin(t * 16) * window4(t, 0.9, 1.0, 2.2, 2.3);
  p.headRoll = side * 0.3 * back;
  p.roll = side * 0.08 * back;
  p.wingL = side < 0 ? 0.25 * back * (0.6 + 0.4 * Math.sin(t * 8)) : 0;
  p.wingR = side > 0 ? 0.25 * back * (0.6 + 0.4 * Math.sin(t * 8)) : 0;
  return p;
}

export const SHAKE = { duration: 1.6 };

/** Fluffs its feathers and shakes off the rain. */
export function shakePose(t: number, seed: number): Pose<DuckKey> {
  const p = paddlePose(t, seed, 0);
  const on = window4(t, 0.05, 0.25, 1.1, 1.5);
  p.fluff = on;
  p.roll = 0.12 * Math.sin(t * 34) * window4(t, 0.3, 0.4, 0.9, 1.1);
  p.headYaw = 0.6 * Math.sin(t * 30) * window4(t, 0.4, 0.5, 0.9, 1.0);
  p.spread = 0.25 * window4(t, 0.4, 0.55, 0.85, 1.0);
  p.squash = -0.06 * on;
  return p;
}

// --- flight ---------------------------------------------------------------------

export const FLY = {
  duration: 7.2,
  runEnd: 1.2,
  climbEnd: 2.2,
  loopEnd: 5.2,
  glideEnd: 6.5,
  run: 1.8,
  glide: 2.4,
  height: 2.6,
} as const;

export interface FlightPlan {
  x: number;
  z: number;
  heading: number;
  /** Loop radius (m) and turn direction (+1 loops left, -1 right). */
  radius: number;
  turn: 1 | -1;
}

/** Where a flying duck is at time t of its flight: x, z, height above water, heading. */
export function flightAt(plan: FlightPlan, t: number): { x: number; z: number; y: number; heading: number } {
  const F = FLY;
  const fx = Math.cos(plan.heading);
  const fz = -Math.sin(plan.heading);
  // the loop's centre sits to one side of the end of the take-off run
  const runEnd = { x: plan.x + fx * F.run, z: plan.z + fz * F.run };
  // the duck's left is (fz, -fx); +1 loops to the left (heading increasing)
  const lx = fz * plan.turn;
  const lz = -fx * plan.turn;
  const cx = runEnd.x + lx * plan.radius;
  const cz = runEnd.z + lz * plan.radius;
  if (t < F.climbEnd) {
    // run along the water, then climb, still heading straight (the loop starts tangentially)
    const u = Math.min(1, t / F.climbEnd);
    const d = F.run * (u * u * 0.6 + u * 0.4);
    const y = F.height * 0.75 * ramp(t, F.runEnd * 0.8, F.climbEnd);
    return { x: plan.x + fx * d, z: plan.z + fz * d, y, heading: plan.heading };
  }
  if (t < F.loopEnd) {
    const u = (t - F.climbEnd) / (F.loopEnd - F.climbEnd);
    const a = u * Math.PI * 2;
    // start at runEnd (angle pointing from centre back to runEnd), sweep a full circle
    const sx = runEnd.x - cx;
    const sz = runEnd.z - cz;
    const c = Math.cos(a * plan.turn);
    const s = Math.sin(a * plan.turn);
    const x = cx + sx * c + sz * s;
    const z = cz - sx * s + sz * c;
    const y = F.height * (0.75 + 0.25 * Math.sin(u * Math.PI)) + 0.15 * Math.sin(u * Math.PI * 4);
    return { x, z, y, heading: plan.heading + a * plan.turn };
  }
  // glide down along the original heading and skid onto the water
  const u = ramp(t, F.loopEnd, F.glideEnd);
  const v = Math.min(1, (t - F.loopEnd) / (F.duration - F.loopEnd));
  const d = F.run + F.glide * (1 - (1 - v) ** 2);
  const y = F.height * 0.75 * (1 - u) ** 1.6;
  return { x: plan.x + fx * d, z: plan.z + fz * d, y, heading: plan.heading };
}

/** The body in flight: wingbeats, a level body with tucked feet, a skid on landing. */
export function flyPose(t: number, seed: number): Pose<DuckKey> {
  const F = FLY;
  const p = paddlePose(t, seed, 1);
  p.headYaw *= 0.2;
  const airborne = window4(t, F.runEnd * 0.7, F.runEnd + 0.3, F.glideEnd - 0.3, F.glideEnd);
  p.spread = Math.max(window4(t, 0.1, 0.35, F.glideEnd, F.duration - 0.3), airborne);
  // fast beats on take-off, slower in the loop, held out in the glide
  const beatRate = t < F.climbEnd ? 15 : 9;
  const beatAmp = t < F.climbEnd ? 0.95 : t < F.loopEnd ? 0.55 : 0.08;
  const beat = Math.sin(t * beatRate) * beatAmp * window4(t, 0.1, 0.3, F.glideEnd - 0.4, F.glideEnd);
  p.wingL = beat;
  p.wingR = beat;
  p.pitch = 0.25 * window4(t, 0.2, 0.6, F.runEnd, F.climbEnd) - 0.06 * airborne;
  p.neck = 0.15 * airborne;
  p.paddle = t * 26 * (1 - airborne);
  // bank into the loop
  p.roll = 0.35 * window4(t, F.climbEnd, F.climbEnd + 0.5, F.loopEnd - 0.5, F.loopEnd);
  // splash down: a squash and a nose-up skid
  p.squash = 0.12 * ring(t - F.glideEnd, 10, 5);
  p.pitch += 0.3 * window4(t, F.glideEnd - 0.2, F.glideEnd, F.glideEnd + 0.2, F.glideEnd + 0.6);
  return p;
}

export function duckPose(state: DuckState, t: number, seed: number, speed = 0.5): Pose<DuckKey> {
  switch (state) {
    case 'dabble': return dabblePose(t, seed);
    case 'preen': return preenPose(t, seed);
    case 'fly': return flyPose(t, seed);
    case 'shake': return shakePose(t, seed);
    default: return paddlePose(t, seed, speed);
  }
}
