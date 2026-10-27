import * as THREE from 'three';
import { groundHeight, WATER_Y } from '../scene/pondShape';
import { rootScale } from './scale';
import type { CreatureRecord } from '../state/document';

/**
 * How a drawn creature is painted in. In water, a drop of pigment blooms
 * outward from the drawing's centre (mode 1); on the bank or a pad,
 * MEADOW's brush strokes sweep from tail to nose (mode 0). The line lingers
 * as a ghost meanwhile; the shadow arrives once enough is painted.
 */
export const FORMATION_DURATION = 1.2;

export interface FormationRequest {
  /** World point the reveal grows out from. */
  origin: THREE.Vector3;
  radius: number;
  duration: number;
  mode: number;
}

/** The middle of a creature's body, where its reveal starts. */
export function formationOrigin(r: CreatureRecord): THREE.Vector3 {
  const k = rootScale(r);
  if (r.kind === 'frog') return new THREE.Vector3(r.x, groundHeight(r.x, r.z) + 0.2 * k, r.z);
  if (r.kind === 'duck') return new THREE.Vector3(r.x, WATER_Y + 0.12 * k, r.z);
  if (r.kind === 'fish') return new THREE.Vector3(r.x, WATER_Y - 0.3 * k, r.z);
  return new THREE.Vector3(r.x, WATER_Y, r.z);
}

/** Reach of the reveal, so the bloom fills the whole silhouette by its end. */
export function formationRadius(r: CreatureRecord): number {
  const k = rootScale(r);
  return r.kind === 'lily' ? 0.55 * k : 0.62 * k;
}
