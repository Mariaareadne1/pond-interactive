import { describe, expect, test } from 'vitest';
import { fishPose, LEAP, leapHeight, leapTravel, SWIM_DEPTH, type FishState } from '../../src/creatures/behaviors/fish';
import { duckPose, flightAt, FLY, type DuckState } from '../../src/creatures/behaviors/duck';
import { frogPose, HOP, hopHeight, hopTravel, type FrogState } from '../../src/creatures/behaviors/frog';
import { lilyPose } from '../../src/creatures/behaviors/lily';
import { DUCK_KEYS, FISH_KEYS, FROG_KEYS, isFinitePose, LILY_KEYS } from '../../src/creatures/pose';

const times = Array.from({ length: 600 }, (_, i) => i * 0.37 + (i % 7) * 0.011);

describe('every behaviour stays finite over long runs', () => {
  test('fish', () => {
    for (const s of ['swim', 'come', 'nose', 'hide', 'leap', 'school', 'feed'] as FishState[]) for (const t of times) expect(isFinitePose(FISH_KEYS, fishPose(s, t, 7)), `${s} ${t}`).toBe(true);
  });
  test('duck', () => {
    for (const s of ['paddle', 'dabble', 'preen', 'fly', 'shake', 'follow', 'feed'] as DuckState[]) for (const t of times) expect(isFinitePose(DUCK_KEYS, duckPose(s, t, 3)), `${s} ${t}`).toBe(true);
  });
  test('frog', () => {
    for (const s of ['sit', 'hop', 'catch', 'croak', 'lookUp'] as FrogState[]) for (const t of times) expect(isFinitePose(FROG_KEYS, frogPose(s, t, 5)), `${s} ${t}`).toBe(true);
  });
  test('lily', () => {
    for (const t of times) expect(isFinitePose(LILY_KEYS, lilyPose({ t, seed: 2, sinceTouch: t % 5, touch: 1, touchDir: 1, open: 0.5, breeze: 1 }))).toBe(true);
  });
});

describe('arcs', () => {
  test('a leap dives, rises clear of the water and returns to cruising depth', () => {
    expect(leapHeight(0)).toBeCloseTo(-SWIM_DEPTH, 6);
    expect(leapHeight(LEAP.duration)).toBeCloseTo(-SWIM_DEPTH, 6);
    expect(leapHeight(LEAP.diveEnd)).toBeLessThan(-SWIM_DEPTH);
    const apex = leapHeight((LEAP.launch + LEAP.reentry) / 2);
    expect(apex).toBeGreaterThan(1);
    // continuous: no jumps between neighbouring frames
    for (let t = 0; t < LEAP.duration; t += 1 / 120) expect(Math.abs(leapHeight(t + 1 / 120) - leapHeight(t))).toBeLessThan(0.08);
  });

  test('leap travel only moves forward, from 0 to the full distance', () => {
    let prev = -1;
    for (let t = 0; t <= LEAP.duration + 0.5; t += 0.01) {
      const d = leapTravel(t);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
    expect(leapTravel(0)).toBe(0);
    expect(leapTravel(LEAP.duration)).toBeCloseTo(LEAP.travel, 6);
  });

  test('the leap squashes in anticipation and stretches in the air', () => {
    expect(fishPose('leap', LEAP.diveEnd * 0.95, 1).squash).toBeGreaterThan(0.05);
    expect(fishPose('leap', LEAP.launch + 0.02, 1).squash).toBeLessThan(-0.05);
  });

  test('a hop starts and ends on the ground, goes all the way, and lands with a squash', () => {
    expect(hopHeight(0, 2)).toBe(0);
    expect(hopHeight(HOP.duration, 2)).toBe(0);
    expect(hopHeight((HOP.launch + HOP.land) / 2, 2)).toBeGreaterThan(0.4);
    expect(hopTravel(0)).toBe(0);
    expect(hopTravel(HOP.land)).toBe(1);
    expect(frogPose('hop', HOP.crouchEnd, 1).squash).toBeGreaterThan(0.1);
    expect(frogPose('hop', HOP.land + 0.06, 1).squash).toBeGreaterThan(0.05);
    expect(frogPose('hop', HOP.duration + 2, 1).hind).toBeLessThan(0.05);
  });

  test('a flight is continuous, climbs well above the water and lands where it planned', () => {
    const plan = { x: 1, z: 0, heading: 0.4, radius: 3, turn: 1 as const };
    let prev = flightAt(plan, 0);
    let top = 0;
    for (let t = 1 / 60; t <= FLY.duration; t += 1 / 60) {
      const p = flightAt(plan, t);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z), `t=${t}`).toBeLessThan(0.2);
      expect(Math.abs(p.y - prev.y)).toBeLessThan(0.1);
      top = Math.max(top, p.y);
      prev = p;
    }
    expect(top).toBeGreaterThan(2);
    const land = flightAt(plan, FLY.duration);
    expect(land.y).toBeCloseTo(0, 3);
    const d = FLY.run + FLY.glide;
    expect(land.x).toBeCloseTo(1 + Math.cos(0.4) * d, 3);
    expect(land.z).toBeCloseTo(-Math.sin(0.4) * d, 3);
  });

  test('the duck tips tail-up when it dabbles and is back level after', () => {
    expect(duckPose('dabble', 1.3, 1).pitch).toBeLessThan(-1);
    expect(Math.abs(duckPose('dabble', 3.4, 1).pitch)).toBeLessThan(0.1);
  });
});
