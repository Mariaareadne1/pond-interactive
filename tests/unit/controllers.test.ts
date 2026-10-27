import { describe, expect, test } from 'vitest';
import { FishController } from '../../src/creatures/controllers/FishController';
import { DuckController } from '../../src/creatures/controllers/DuckController';
import { FrogController } from '../../src/creatures/controllers/FrogController';
import { LilyController } from '../../src/creatures/controllers/LilyController';
import { EMPTY_SENSE, type PondSense } from '../../src/creatures/controllers/base';
import { isFinitePose, DUCK_KEYS, FISH_KEYS, FROG_KEYS, type Frame } from '../../src/creatures/pose';
import { edgeDistance, isBank, isWater } from '../../src/scene/pondShape';
import { seededRandom } from '../../src/scene/noise';
import { LEAP } from '../../src/creatures/behaviors/fish';
import { FLY } from '../../src/creatures/behaviors/duck';

const finiteFrame = (f: Frame<string>) => [f.x, f.y, f.z, f.heading, f.phase].every(Number.isFinite);

/** A tiny pond with one pad, for creatures that need something to find. */
function senseWith(pad: LilyController): PondSense {
  return {
    ...EMPTY_SENSE,
    pads: () => [{ id: 'pad', x: pad.x, z: pad.z, y: 0.05, radius: pad.radius, heading: pad.heading }],
    pad: (id) => (id === 'pad' ? { id, x: pad.x, z: pad.z, y: 0.05, radius: pad.radius, heading: pad.heading } : null),
  };
}

describe('controllers under rapid, random input', () => {
  test('a fish stays in the water and finite whatever it is asked to do', () => {
    const rand = seededRandom(9);
    const pad = new LilyController(1, 3, 0, 0, 'none');
    pad.scale = 2;
    const sense = senseWith(pad);
    const f = new FishController(4, 0, 0, 0, false);
    f.scale = 1.4;
    for (let i = 0; i < 6000; i++) {
      const r = rand();
      if (r < 0.01) f.leap();
      else if (r < 0.02) f.comeTo((rand() - 0.5) * 30, (rand() - 0.5) * 22);
      else if (r < 0.025) f.hideUnder('pad');
      else if (r < 0.03) f.swim();
      const frame = f.update(1 / 60, sense);
      expect(finiteFrame(frame)).toBe(true);
      expect(isFinitePose(FISH_KEYS, frame.pose)).toBe(true);
      expect(isWater(frame.x, frame.z, 0.2), `step ${i} at ${frame.x},${frame.z}`).toBe(true);
    }
  });

  test('a leap always ends back in the water near cruising depth', () => {
    for (const [x, z, h] of [[0, 0, 0], [-7, 0, Math.PI], [7, -2, 0.2], [0, 4.5, -1.6]]) {
      const f = new FishController(2, x, z, h, false);
      f.scale = 1.4;
      f.leap();
      let frame = f.update(0, EMPTY_SENSE);
      for (let t = 0; t < LEAP.duration + 0.5; t += 1 / 60) frame = f.update(1 / 60, EMPTY_SENSE);
      expect(isWater(frame.x, frame.z, 0.2)).toBe(true);
      expect(f.state).toBe('swim');
      expect(frame.y).toBeLessThan(0);
    }
  });

  test('a duck flies a loop and lands on the water, wherever it starts', () => {
    for (const [x, z, h] of [[0, 0, 0], [-7, 1, 2], [6, -3, -1], [2, 4, 1.5]]) {
      const d = new DuckController(5, x, z, h, null);
      d.scale = 1.9;
      d.fly();
      let frame = d.update(0, EMPTY_SENSE);
      let top = 0;
      for (let t = 0; t < FLY.duration + 0.5; t += 1 / 60) {
        frame = d.update(1 / 60, EMPTY_SENSE);
        top = Math.max(top, frame.y);
        expect(edgeDistance(frame.x, frame.z)).toBeGreaterThan(0.5);
      }
      expect(top).toBeGreaterThan(1.5);
      expect(isWater(frame.x, frame.z, 0.3)).toBe(true);
      expect(frame.y).toBe(0);
      expect(d.state).toBe('paddle');
    }
  });

  test('a duck mashed with actions never strands a pose', () => {
    const rand = seededRandom(3);
    const d = new DuckController(5, 0, 0, 0, null);
    d.scale = 1.9;
    for (let i = 0; i < 5000; i++) {
      const r = rand();
      if (r < 0.01) d.fly();
      else if (r < 0.03) d.dabble();
      else if (r < 0.05) d.preen();
      else if (r < 0.06) d.shake();
      const frame = d.update(1 / 60, EMPTY_SENSE);
      expect(finiteFrame(frame) && isFinitePose(DUCK_KEYS, frame.pose)).toBe(true);
    }
    for (let i = 0; i < 600; i++) d.update(1 / 60, EMPTY_SENSE);
    const settled = d.update(1 / 60, EMPTY_SENSE);
    expect(Math.abs(settled.pose.pitch)).toBeLessThan(0.2);
    expect(Math.abs(settled.pose.wingL)).toBeLessThan(0.05);
  });

  test('a frog hops onto a pad, rides it, and hops back to the bank', () => {
    const pad = new LilyController(1, -7.2, 3.6, 0, 'none');
    pad.scale = 2;
    const sense = senseWith(pad);
    const frog = new FrogController(7, -9.6, 6, 0, null);
    frog.scale = 1.6;
    expect(frog.hopTo(null, sense)).toBe(true);
    for (let t = 0; t < 2; t += 1 / 60) frog.update(1 / 60, sense);
    expect(frog.perch).toBe('pad');
    // the pad drifts: the frog goes with it
    pad.x += 0.5;
    const f = frog.update(1 / 60, sense);
    expect(f.x).toBeCloseTo(pad.x, 1);
    // with no other pad around, the next hop is to the bank
    const away = { ...sense, pads: () => [] };
    expect(frog.hopTo(null, away)).toBe(true);
    let last = frog.update(0, away);
    for (let t = 0; t < 2; t += 1 / 60) last = frog.update(1 / 60, away);
    expect(frog.perch).toBeNull();
    expect(isBank(last.x, last.z)).toBe(true);
  });

  test('a frog mashed with actions stays finite and on its feet', () => {
    const rand = seededRandom(5);
    const frog = new FrogController(7, -9.6, 6, 0, null);
    frog.scale = 1.6;
    for (let i = 0; i < 4000; i++) {
      const r = rand();
      if (r < 0.01) frog.hopTo(null, EMPTY_SENSE);
      else if (r < 0.03) frog.catchFly();
      else if (r < 0.05) frog.croak();
      const f = frog.update(1 / 60, EMPTY_SENSE);
      expect(finiteFrame(f) && isFinitePose(FROG_KEYS, f.pose)).toBe(true);
      if (frog.state !== 'hop') expect(isBank(f.x, f.z) || f.x === -9.6).toBe(true);
    }
  });

  test('a lily pad drifts, settles and blooms', () => {
    const pad = new LilyController(1, 2, 0, 0, 'bud');
    pad.scale = 2;
    pad.startDrift();
    let f = pad.update(0, EMPTY_SENSE);
    for (let t = 0; t < 10; t += 1 / 60) f = pad.update(1 / 60, EMPTY_SENSE);
    expect(Math.hypot(f.x - 2, f.z)).toBeGreaterThan(0.8);
    expect(isWater(f.x, f.z, 0.5)).toBe(true);
    pad.setFlower('open');
    for (let t = 0; t < 3; t += 1 / 60) f = pad.update(1 / 60, EMPTY_SENSE);
    expect(f.pose.open).toBeCloseTo(1, 3);
  });
});
