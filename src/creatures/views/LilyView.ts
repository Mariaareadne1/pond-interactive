import * as THREE from 'three';
import { CreatureView } from './CreatureView';
import { PART } from '../materials';
import type { CreatureGeometries } from '../geometry/shapes';
import type { WorldUniforms } from '../../scene/world';
import type { FlowerState } from '../types';
import type { Frame, LilyKey } from '../pose';

export const LILY_LOCAL_LENGTH = 1.0;
const OUTER = 8;
const INNER = 7;

/**
 * A lily pad floating flat on the water, with an optional flower: two rings
 * of cream petals with pink tips around a gold centre. `open` folds the
 * petals from a closed bud (pointing up) to a full bloom.
 */
export class LilyView extends CreatureView {
  private readonly pad = new THREE.Group();
  private readonly flower = new THREE.Group();
  private readonly petals: { pivot: THREE.Group; inner: boolean; i: number }[] = [];
  flowerState: FlowerState = 'none';

  constructor(id: string, seed: number, geo: CreatureGeometries, world: WorldUniforms) {
    super(id, 'lily', seed, world);
    this.root.add(this.pad);
    this.part(this.pad, geo.pad, PART.lilyPad, { uv: true, doubleSided: true });
    this.flower.position.set(-0.06, 0.02, 0.07);
    this.pad.add(this.flower);
    this.part(this.flower, geo.centre, PART.lilyCentre);
    for (let ring = 0; ring < 2; ring++) {
      const n = ring === 0 ? OUTER : INNER;
      for (let i = 0; i < n; i++) {
        const yaw = new THREE.Group();
        yaw.rotation.y = (i / n) * Math.PI * 2 + ring * 0.4 + seed * 0.37;
        const pivot = new THREE.Group();
        pivot.position.y = ring * 0.012;
        const s = ring === 0 ? 1 : 0.8;
        pivot.scale.setScalar(s);
        yaw.add(pivot);
        this.part(pivot, geo.petal, PART.lilyPetal, { doubleSided: true });
        this.flower.add(yaw);
        this.petals.push({ pivot, inner: ring === 1, i });
      }
    }
    this.flower.visible = false;
    this.proxy.scale.set(0.5, 0.08, 0.5);
    this.proxy.position.set(0, 0.03, 0);
  }

  setFlower(state: FlowerState): void {
    this.flowerState = state;
    this.flower.visible = state !== 'none';
  }

  apply(f: Frame<LilyKey>): void {
    const p = f.pose;
    this.root.position.set(f.x, f.y + p.bob, f.z);
    this.root.rotation.set(0, f.heading + p.spin, 0);
    // a tilt toward whatever just touched it
    this.pad.rotation.set(Math.sin(p.tiltDir) * p.tilt, 0, Math.cos(p.tiltDir) * p.tilt);
    const open = p.open;
    for (const petal of this.petals) {
      // closed: petals stand up and cup together; open: they lie back
      const closed = petal.inner ? 1.45 : 1.3;
      const bloom = petal.inner ? 0.75 : 0.22 + 0.05 * Math.sin(petal.i * 2.3);
      petal.pivot.rotation.z = closed + (bloom - closed) * open;
    }
  }
}
