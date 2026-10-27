import { BOUNDS, clampToBank, clampToWater, edgeDistance, isBank, isWater, jettySDF, pondSDF } from '../scene/pondShape';
import type { Kind } from './types';

/**
 * Where each kind may live. Fish and lily pads need water; frogs sit on the
 * bank (or a pad); ducks are happy on either — paddling on the pond or
 * waddling about the bank.
 */

/** How high a standing duck's body rides above the ground, in its own units. */
export const DUCK_LAND_LIFT = 0.13;

/** Is a duck at (x, z) standing on the bank rather than floating? */
export function duckOnLand(x: number, z: number): boolean {
  return pondSDF(x, z) > -0.15;
}

/** Is this creature, at this spot, on land (so it's painted in with the brush rather than the bloom)? */
export function onLand(kind: Kind, x: number, z: number): boolean {
  if (kind === 'frog') return true;
  if (kind === 'duck') return duckOnLand(x, z);
  return false;
}

/** The nearest spot a duck can be: open water or the bank, whichever is closer. */
export function clampDuck(x: number, z: number): [number, number] {
  if (isWater(x, z, 0.6) || isBank(x, z)) return [x, z];
  const w = clampToWater(x, z, 0.6);
  const b = clampToBank(x, z);
  return Math.hypot(w[0] - x, w[1] - z) <= Math.hypot(b[0] - x, b[1] - z) ? w : b;
}

// --- regions for smooth steering: how far (m) a point is inside where a creature may go ---

/** Open water, keeping `clearance` from the shore and clear of the jetty. */
export const waterRegion = (clearance: number) => (x: number, z: number): number =>
  Math.min(-pondSDF(x, z) - clearance, jettySDF(x, z) - 0.45);

/** The bank: off the shore, inside the tile's painted edge, off the jetty. */
export const bankRegion = (x: number, z: number): number =>
  Math.min(pondSDF(x, z) - BOUNDS.bankClearance, edgeDistance(x, z) - BOUNDS.edge, jettySDF(x, z) - 0.1);

/** Anywhere a duck can walk or swim: the whole tile but the paper edge and the jetty. */
export const duckRegion = (x: number, z: number): number => Math.min(edgeDistance(x, z) - BOUNDS.edge, jettySDF(x, z) - 0.1);
