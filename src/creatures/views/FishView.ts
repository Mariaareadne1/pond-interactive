import * as THREE from 'three';
import { CreatureView } from './CreatureView';
import { PART } from '../materials';
import type { CreatureGeometries } from '../geometry/shapes';
import type { WorldUniforms } from '../../scene/world';
import type { FishKey, Frame } from '../pose';

/** Local length of the fish shape, nose to tail tip. */
export const FISH_LOCAL_LENGTH = 1.38;
const TAIL_ROOT = new THREE.Vector3(-0.43, 0, 0);

/**
 * A koi (or minnow): a soft body that bends with a travelling wave from the
 * tail, a flowing horizontal tail fan, pectoral fins that flutter, a little
 * dorsal ridge and two dark eyes. Squash-and-stretch scales the body along
 * its length during a leap.
 */
export class FishView extends CreatureView {
  private readonly body = new THREE.Group();
  private readonly finL: THREE.Mesh;
  private readonly finR: THREE.Mesh;

  constructor(id: string, seed: number, geo: CreatureGeometries, world: WorldUniforms, readonly minnow: boolean) {
    super(id, 'fish', seed, world);
    this.root.add(this.body);
    this.part(this.body, geo.body, PART.fishBody, { bend: true });
    const tail = this.part(this.body, geo.tail, PART.fishFin, { bend: true, doubleSided: true, cutout: true, offset: TAIL_ROOT });
    tail.position.copy(TAIL_ROOT);
    const dorsal = this.part(this.body, geo.dorsal, PART.fishFin, { bend: true, doubleSided: true, cutout: true, offset: new THREE.Vector3(0.02, 0, 0) });
    dorsal.position.set(0.02, minnow ? 0.06 : 0.085, 0);
    this.finL = this.part(this.body, geo.pectoral, PART.fishFin, { doubleSided: true, cutout: true, castShadow: false });
    this.finR = this.part(this.body, geo.pectoral, PART.fishFin, { doubleSided: true, cutout: true, castShadow: false });
    this.finL.position.set(0.24, -0.045, -0.075);
    this.finR.position.set(0.24, -0.045, 0.075);
    this.finL.scale.z = -1;
    for (const s of [-1, 1]) {
      const eye = this.part(this.body, geo.eye, PART.fishEye, { castShadow: false });
      eye.position.set(0.45, 0.032, 0.074 * s * (minnow ? 0.8 : 1));
      eye.scale.set(0.75, 0.75, 0.45);
    }
    this.proxy.scale.set(0.62, 0.22, 0.3);
    this.proxy.position.set(0.0, 0, 0);
  }

  apply(f: Frame<FishKey>): void {
    const p = f.pose;
    this.root.position.set(f.x, f.y, f.z);
    this.root.rotation.set(0, f.heading, 0, 'YZX');
    this.body.rotation.set(p.roll, 0, p.pitch, 'YZX');
    // stretch along the body (negative squash) / squash short and wide
    const sq = p.squash;
    this.body.scale.set(1 - sq, 1 + sq * 0.5, 1 + sq * 0.5);
    this.uniforms.uSwimPhase.value = f.phase;
    this.uniforms.uSwimAmp.value = p.amp;
    this.uniforms.uTurn.value = p.turn;
    const flutter = 0.35 + 0.35 * p.fin;
    this.finL.rotation.y = -flutter;
    this.finR.rotation.y = flutter;
  }
}
