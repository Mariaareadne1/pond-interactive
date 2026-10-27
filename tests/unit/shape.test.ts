import { describe, expect, test } from 'vitest';
import { classifyWater, measureShape } from '../../src/interaction/shape';
import { circle, duck, ellipse, fish } from '../fixtures/drawings';

describe('reading a drawing on the water', () => {
  test('a long loop with a tail notch is a fish facing away from the tail', () => {
    for (const faceLeft of [false, true]) {
      const c = classifyWater(measureShape(fish(400, 300, 1, faceLeft)));
      expect(c.kind).toBe('fish');
      expect(Math.sign(c.facing.x)).toBe(faceLeft ? -1 : 1);
    }
  });

  test('a plain elongated loop (aspect > ~1.8) is a fish', () => {
    expect(classifyWater(measureShape(ellipse(300, 300, 90, 30))).kind).toBe('fish');
    expect(classifyWater(measureShape(ellipse(300, 300, 90, 30, 0.9))).kind).toBe('fish');
  });

  test('a loop with a bump on top at one end is a duck facing its head', () => {
    for (const faceLeft of [false, true]) {
      const f = measureShape(duck(500, 400, 1, faceLeft));
      const c = classifyWater(f);
      expect(c.kind).toBe('duck');
      expect(Math.sign(c.facing.x)).toBe(faceLeft ? -1 : 1);
    }
  });

  test('a roundish loop is a lily pad', () => {
    expect(classifyWater(measureShape(circle(300, 300, 60))).kind).toBe('lily');
    expect(classifyWater(measureShape(ellipse(300, 300, 66, 52))).kind).toBe('lily');
  });

  test('an in-between loop is a best guess with alternatives offered', () => {
    const c = classifyWater(measureShape(ellipse(300, 300, 70, 44)));
    expect(['fish', 'lily']).toContain(c.kind);
    expect(c.confident).toBe(false);
    expect(c.alternatives.length).toBeGreaterThan(0);
  });

  test('measurements are finite for degenerate input', () => {
    const f = measureShape([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    for (const v of [f.elongation, f.length, f.width, f.headBump, f.notch]) expect(Number.isFinite(v)).toBe(true);
  });
});
