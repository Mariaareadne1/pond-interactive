import { describe, expect, test } from 'vitest';
import { FishController } from '../../src/creatures/controllers/FishController';
import { DuckController } from '../../src/creatures/controllers/DuckController';
import { EMPTY_SENSE, wrapAngle, type PondSense } from '../../src/creatures/controllers/base';
import { duckOnLand, duckRegion } from '../../src/creatures/habitat';
import { isWater } from '../../src/scene/pondShape';
import type { Frame } from '../../src/creatures/pose';

/**
 * Motion must be smooth: no frame-to-frame flicker in heading, no sudden
 * jumps in position or in the body's pose. These were the causes of tails
 * and ducks "jittering".
 */

interface Stats { flips: number; heading: number; step: number; keys: Record<string, number> }

function run(update: () => Frame<string>, keys: string[], frames: number, each?: (f: Frame<string>) => void): Stats {
  let prev = update();
  let prevDh = 0;
  let prevV = 0;
  const stats: Stats = { flips: 0, heading: 0, step: 0, keys: {} };
  for (let i = 0; i < frames; i++) {
    const f = update();
    each?.(f);
    const dh = wrapAngle(f.heading - prev.heading);
    if (Math.abs(dh) > 0.002 && Math.abs(prevDh) > 0.002 && Math.sign(dh) !== Math.sign(prevDh)) stats.flips++;
    stats.heading = Math.max(stats.heading, Math.abs(dh));
    const v = Math.hypot(f.x - prev.x, f.z - prev.z);
    stats.step = Math.max(stats.step, Math.abs(v - prevV));
    for (const k of keys) stats.keys[k] = Math.max(stats.keys[k] ?? 0, Math.abs(f.pose[k] - prev.pose[k]));
    prevDh = dh;
    prevV = v;
    prev = f;
  }
  return stats;
}

const STARTS = [[0, 0, 0], [-7, 1, 2], [6, -3, -1], [8.5, 0, 0], [-2, 4.5, 1.6]];

describe('smooth motion', () => {
  test('fish glide without flicker: no heading dithering, no tail snaps, no position jumps', () => {
    for (const [x, z, h] of STARTS) {
      const f = new FishController(4, x, z, h, false);
      f.scale = 1.45;
      const s = run(() => f.update(1 / 60, EMPTY_SENSE), ['turn', 'amp', 'pitch'], 18000);
      expect(s.flips, `fish ${x},${z}`).toBeLessThan(5);
      expect(s.keys.turn).toBeLessThan(0.06);
      expect(s.step).toBeLessThan(0.03);
    }
  });

  test('a fish turning to leap toward open water turns over several frames, never in one', () => {
    const f = new FishController(4, 8.4, -0.5, 0, false);
    f.scale = 1.45;
    f.leap();
    const s = run(() => f.update(1 / 60, EMPTY_SENSE), ['turn', 'squash'], 130);
    expect(s.heading).toBeLessThan(0.2);
  });

  test('ducks paddle and waddle without flicker in heading, head or body', () => {
    for (const [x, z, h] of [...STARTS, [-11, 7.5, 0]]) {
      const d = new DuckController(5, x, z, h, null);
      d.scale = 1.95;
      const s = run(() => d.update(1 / 60, EMPTY_SENSE), ['roll', 'pitch', 'headYaw', 'paddle'], 18000);
      expect(s.flips, `duck ${x},${z}`).toBeLessThan(5);
      expect(s.keys.headYaw).toBeLessThan(0.08);
      expect(s.keys.roll).toBeLessThan(0.05);
      expect(s.keys.paddle).toBeLessThan(0.25);
      expect(s.step).toBeLessThan(0.04);
    }
  });

  test('a duck taking off turns to its run gradually', () => {
    const d = new DuckController(5, 0.6, -0.3, 0, null);
    d.scale = 1.95;
    d.fly();
    const s = run(() => d.update(1 / 60, EMPTY_SENSE), ['roll'], 60);
    expect(s.heading).toBeLessThan(0.25);
  });
});

describe('ducks go in and out of the water as they please', () => {
  test('left alone, a duck on the water goes ashore and comes back, never leaving the tile', () => {
    const d = new DuckController(7, 0.6, -0.3, 0.4, null);
    d.scale = 1.95;
    let changes = 0;
    let land = d.onLand;
    let everAshore = false;
    run(() => d.update(1 / 60, EMPTY_SENSE), [], 60 * 60 * 6, (f) => {
      expect(duckRegion(f.x, f.z)).toBeGreaterThan(-0.05);
      if (d.onLand !== land) {
        changes++;
        land = d.onLand;
      }
      if (d.onLand) everAshore = true;
    });
    expect(everAshore).toBe(true);
    expect(changes).toBeGreaterThanOrEqual(2);
  });

  test('a duck walked into a corner of the tile turns and walks out instead of freezing', () => {
    const d = new DuckController(5, 12.6, -9.1, 0.8, null);
    d.scale = 1.95;
    let f = d.update(0, EMPTY_SENSE);
    for (let i = 0; i < 60 * 8; i++) f = d.update(1 / 60, EMPTY_SENSE);
    expect(Math.hypot(f.x - 12.6, f.z + 9.1)).toBeGreaterThan(0.5);
  });

  test('a duck on the bank wanders down into the water and floats there', () => {
    const d = new DuckController(9, -11, 7.5, 0, null);
    d.scale = 1.95;
    expect(d.onLand).toBe(true);
    expect(d.wander()).toBe(true);
    let frame = d.update(0, EMPTY_SENSE);
    for (let i = 0; i < 60 * 25 && d.crossing; i++) frame = d.update(1 / 60, EMPTY_SENSE);
    expect(d.crossing).toBe(false);
    expect(d.onLand).toBe(false);
    expect(isWater(frame.x, frame.z, 0.3)).toBe(true);
    // its height eases down to the water rather than dropping
    for (let i = 0; i < 120; i++) frame = d.update(1 / 60, EMPTY_SENSE);
    expect(frame.y).toBeCloseTo(0, 2);
  });

  test('ducklings follow their parent ashore', () => {
    const parent = new DuckController(7, -6, 3, 2.2, null);
    parent.scale = 1.95;
    const ling = new DuckController(8, -5, 2.6, 2.2, 'p');
    ling.scale = 1.1;
    const sense: PondSense = { ...EMPTY_SENSE, positionOf: () => ({ x: parent.x, z: parent.z, heading: parent.heading, y: 0 }) };
    parent.wander();
    for (let i = 0; i < 60 * 30; i++) {
      parent.update(1 / 60, sense);
      ling.update(1 / 60, sense);
    }
    expect(parent.onLand).toBe(true);
    expect(Math.hypot(ling.x - parent.x, ling.z - parent.z)).toBeLessThan(3.5);
    expect(duckOnLand(ling.x, ling.z)).toBe(true);
  });
});
