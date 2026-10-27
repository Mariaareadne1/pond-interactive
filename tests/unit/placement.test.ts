import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { createCamera, frameCamera } from '../../src/scene/camera';
import { screenToGround, screenToWater, surfaceAt } from '../../src/interaction/rays';
import { clampToBank, clampToWater, groundHeight, isBank, isWater, onJetty, pondSDF, TILE, waterDepth } from '../../src/scene/pondShape';
import { placeFor } from '../../src/state/document';

function setup(w = 1440, h = 900) {
  const camera = createCamera();
  frameCamera(camera, w, h);
  return { camera, rect: { left: 0, top: 0, width: w, height: h } };
}

/** Projected width (px) of a 1.8 m fish at (x, z) on the water. */
function projectedLength(camera: THREE.PerspectiveCamera, h: number, x: number, z: number): number {
  const a = new THREE.Vector3(x - 0.9, -0.3, z).project(camera);
  const b = new THREE.Vector3(x + 0.9, -0.3, z).project(camera);
  return ((b.x - a.x) / 2) * h * camera.aspect;
}

const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * TILE.halfX, 0, sz * TILE.halfZ));

describe('camera framing', () => {
  test('landscape: the whole tile fits with a margin of paper', () => {
    const { camera } = setup();
    for (const c of corners) {
      const p = c.clone().project(camera);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.87);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.87);
    }
  });

  test('portrait: the camera turns a quarter so the tile runs down the phone', () => {
    const { camera } = setup(390, 844);
    expect(Math.abs(camera.rotation.y)).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('the pond and its banks', () => {
  test('the middle is water and the corners are bank', () => {
    expect(pondSDF(0.6, -0.3)).toBeLessThan(-4);
    expect(isWater(0.6, -0.3)).toBe(true);
    for (const [x, z] of [[-11, -8], [11, -8], [-11, 8], [11, 8]]) expect(isBank(x, z)).toBe(true);
  });

  test('the ground is under water inside the pond and above it outside, meeting at the shore', () => {
    expect(groundHeight(0.6, -0.3)).toBeLessThan(-1);
    expect(groundHeight(-11, 8)).toBeGreaterThan(0);
    expect(waterDepth(0.6, -0.3)).toBeGreaterThan(1);
    expect(waterDepth(-11, 8)).toBe(0);
  });

  test('clamping always lands somewhere the creature can live', () => {
    for (let i = 0; i < 200; i++) {
      const x = (Math.sin(i * 12.9898) * 0.5) * 2 * TILE.halfX;
      const z = (Math.sin(i * 78.233) * 0.5) * 2 * TILE.halfZ;
      const [wx, wz] = clampToWater(x, z);
      expect(isWater(wx, wz, 0.5), `water from ${x},${z}`).toBe(true);
      const [bx, bz] = clampToBank(x, z);
      expect(isBank(bx, bz), `bank from ${x},${z}`).toBe(true);
    }
  });

  test('the jetty is not water to swim through', () => {
    expect(onJetty(5.7, 3.9)).toBe(true);
    expect(isWater(4.6, 3.0)).toBe(false);
  });

  test('frogs placed in the water are moved to the bank; ducks drawn on the bank go into the water', () => {
    const [fx, fz] = placeFor('frog', 0.6, -0.3);
    expect(isBank(fx, fz)).toBe(true);
    const [dx, dz] = placeFor('duck', -11, 8);
    expect(isWater(dx, dz, 0.5)).toBe(true);
  });
});

describe('screen to world', () => {
  test('water rays hit the plane exactly and project back to the same pixel', () => {
    const { camera, rect } = setup();
    for (const [sx, sy] of [[720, 450], [600, 500], [900, 380]]) {
      const hit = screenToWater(camera, rect, sx, sy)!;
      expect(hit.y).toBeCloseTo(0, 6);
      const back = hit.clone().project(camera);
      expect(((back.x + 1) / 2) * rect.width).toBeCloseTo(sx, 2);
      expect(((1 - back.y) / 2) * rect.height).toBeCloseTo(sy, 2);
    }
  });

  test('ground rays land on the bank height function', () => {
    const { camera, rect } = setup();
    const hit = screenToGround(camera, rect, 300, 650)!;
    expect(hit.y).toBeCloseTo(groundHeight(hit.x, hit.z), 3);
  });

  test('the middle of the screen is water, the far corners of the screen are paper', () => {
    const { camera, rect } = setup();
    expect(surfaceAt(camera, rect, 720, 430).surface).toBe('water');
    expect(surfaceAt(camera, rect, 10, 10).surface).toBe('paper');
    expect(surfaceAt(camera, rect, 1430, 890).surface).toBe('paper');
  });

  test('a fish on the far side of the pond is drawn smaller than one on the near side', () => {
    const { camera } = setup();
    const near = projectedLength(camera, 900, 0.6, 4.5);
    const far = projectedLength(camera, 900, 0.6, -5);
    expect(far).toBeLessThan(near * 0.9);
    // and a koi reads as a character at the default camera
    expect(projectedLength(camera, 900, 0.6, -0.3)).toBeGreaterThan(60);
  });
});
