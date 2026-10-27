import * as THREE from 'three';
import { CreatureView } from './CreatureView';
import { PART } from '../materials';
import type { CreatureGeometries } from '../geometry/shapes';
import type { WorldUniforms } from '../../scene/world';
import type { FrogKey, Frame } from '../pose';

export const FROG_LOCAL_LENGTH = 0.85;

/**
 * A squat frog: a soft body that squashes on its belly, big eyes that sit
 * proud of the head and blink, folded back legs that straighten for a hop,
 * a cream throat that pulses (and balloons for a croak), and a pink tongue.
 */
export class FrogView extends CreatureView {
  private readonly body = new THREE.Group();
  private readonly inner = new THREE.Group();
  private readonly hipL = new THREE.Group();
  private readonly hipR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly throat: THREE.Mesh;
  private readonly tongue: THREE.Mesh;

  constructor(id: string, seed: number, geo: CreatureGeometries, world: WorldUniforms) {
    super(id, 'frog', seed, world);
    this.root.add(this.body);
    this.body.add(this.inner);
    this.part(this.inner, geo.body, PART.frogBody);
    for (const s of [-1, 1]) {
      const eye = this.part(this.inner, geo.eye, PART.frogEye, { castShadow: false });
      eye.position.set(0.214, 0.348, 0.13 * s);
      this.eyes.push(eye);
    }
    this.throat = this.part(this.inner, geo.throat, PART.frogThroat, { castShadow: false });
    this.throat.position.set(0.27, 0.1, 0);
    this.tongue = this.part(this.inner, geo.tongue, PART.frogTongue, { castShadow: false });
    this.tongue.position.set(0.3, 0.15, 0);
    for (const [hip, s] of [[this.hipL, -1], [this.hipR, 1]] as const) {
      hip.position.set(-0.16, 0.13, 0.19 * s);
      hip.rotation.order = 'YZX';
      const thigh = this.part(hip, geo.thigh, PART.frogLimb);
      thigh.scale.z = s;
      this.inner.add(hip);
    }
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(0.2, 0.16, 0.16 * s);
      const m = this.part(arm, geo.arm, PART.frogLimb);
      m.scale.z = s;
      this.inner.add(arm);
    }
    this.proxy.scale.set(0.42, 0.3, 0.36);
    this.proxy.position.set(0.02, 0.2, 0);
  }

  apply(f: Frame<FrogKey>): void {
    const p = f.pose;
    this.root.position.set(f.x, f.y + p.lift, f.z);
    this.root.rotation.set(0, f.heading, 0, 'YZX');
    this.body.rotation.set(0, p.headYaw * 0.3, p.pitch, 'YZX');
    // squash > 0 flattens and widens about the belly; < 0 stretches tall
    const sq = p.squash;
    this.body.scale.set(1 + sq * 0.35, 1 - sq, 1 + sq * 0.45);
    this.inner.rotation.z = p.lookUp * 0.25;
    const lid = 1 - 0.85 * Math.min(1, p.blink);
    for (const e of this.eyes) e.scale.set(0.86, 0.78 * lid, 0.86);
    // the throat pulses gently, and balloons when it croaks
    const t = 1 + p.throat * 0.12 + p.croak * 0.9;
    this.throat.scale.set(0.9 + p.croak * 0.5, t * 0.85, 0.95 + p.croak * 0.6);
    this.throat.position.y = 0.1 - p.croak * 0.03;
    this.uniforms.uFlush.value = p.croak;
    this.tongue.visible = p.tongue > 0.02;
    this.tongue.scale.set(Math.max(0.01, p.tongue), 1, 1);
    // hind legs fold up tight at rest and straighten out behind for a leap
    const ext = p.hind;
    this.hipL.rotation.set(0, ext * 0.25, -ext * 0.9);
    this.hipR.rotation.set(0, -ext * 0.25, -ext * 0.9);
    this.hipL.position.x = this.hipR.position.x = -0.16 - ext * 0.06;
    this.armL.rotation.z = this.armR.rotation.z = p.front * 0.8;
  }
}
