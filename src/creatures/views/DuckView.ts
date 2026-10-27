import * as THREE from 'three';
import { CreatureView } from './CreatureView';
import { PART } from '../materials';
import type { CreatureGeometries } from '../geometry/shapes';
import type { WorldUniforms } from '../../scene/world';
import type { DuckKey, Frame } from '../pose';

export const DUCK_LOCAL_LENGTH = 1.0;
/** The body rocks about this point (just under the waterline, mid-body). */
const BODY_PIVOT = new THREE.Vector3(0, 0.05, 0);

/**
 * A round, buoyant duck: a soft feathery body riding low in the water with
 * its little tail up, a head on a short neck that can turn, tip and tuck,
 * a soft orange bill, wings that lie folded or beat, and orange feet that
 * paddle under the surface (seen through the water's tint).
 */
export class DuckView extends CreatureView {
  private readonly body = new THREE.Group();
  private readonly inner = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly feet: THREE.Mesh[] = [];
  private readonly eyes: THREE.Mesh[] = [];
  private readonly legs: THREE.Mesh[] = [];
  private legGeometry: THREE.BufferGeometry | null = null;

  constructor(id: string, seed: number, geo: CreatureGeometries, world: WorldUniforms) {
    super(id, 'duck', seed, world);
    this.root.add(this.body);
    this.body.position.copy(BODY_PIVOT);
    this.inner.position.copy(BODY_PIVOT).multiplyScalar(-1);
    this.body.add(this.inner);
    this.part(this.inner, geo.body, PART.duckBody);

    this.neck.position.set(0.24, 0.13, 0);
    this.neck.rotation.order = 'YZX';
    this.inner.add(this.neck);
    this.head.position.set(0.05, 0.22, 0);
    this.head.rotation.order = 'YZX';
    this.neck.add(this.head);
    this.part(this.head, geo.head, PART.duckHead);
    const bill = this.part(this.head, geo.bill, PART.duckBill);
    bill.position.set(0.095, -0.02, 0);
    bill.rotation.z = -0.1;
    for (const s of [-1, 1]) {
      const eye = this.part(this.head, geo.eye, PART.duckEye, { castShadow: false });
      eye.position.set(0.055, 0.03, 0.088 * s);
      eye.scale.set(1, 1, 0.55);
      this.eyes.push(eye);
    }

    for (const [wing, s] of [[this.wingL, -1], [this.wingR, 1]] as const) {
      wing.position.set(0.12, 0.165, 0.128 * s);
      wing.rotation.order = 'YXZ';
      const m = this.part(wing, geo.wing, PART.duckWing);
      m.scale.z = s;
      this.inner.add(wing);
    }
    // short legs, so a duck standing on the bank stands on its feet
    const leg = new THREE.CylinderGeometry(0.017, 0.02, 0.09, 8);
    leg.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(leg.getAttribute('position').count).fill(1), 1));
    this.legGeometry = leg;
    for (const s of [-1, 1]) {
      const shin = this.part(this.inner, leg, PART.duckFoot, { castShadow: false });
      shin.position.set(0.02, -0.075, 0.075 * s);
      this.legs.push(shin);
      const foot = this.part(this.inner, geo.foot, PART.duckFoot, { doubleSided: true, castShadow: false });
      foot.position.set(0.02, -0.12, 0.09 * s);
      this.feet.push(foot);
    }
    this.proxy.scale.set(0.45, 0.32, 0.32);
    this.proxy.position.set(0.02, 0.2, 0);
  }

  apply(f: Frame<DuckKey>): void {
    const p = f.pose;
    this.root.position.set(f.x, f.y + p.bob + p.lift, f.z);
    this.root.rotation.set(0, f.heading, 0, 'YZX');
    this.body.rotation.set(p.roll, 0, p.pitch, 'YZX');
    const sq = p.squash;
    this.body.scale.set(1 + sq * 0.4 + p.fluff * 0.05, 1 - sq + p.fluff * 0.06, 1 + sq * 0.4 + p.fluff * 0.08);
    this.uniforms.uFlush.value = p.fluff;
    this.neck.rotation.set(0, p.headYaw * 0.4, p.neck);
    this.head.rotation.set(p.headRoll, p.headYaw * 0.6, p.headPitch);
    // folded wings lie along the body; spread opens them out, wingL/R beat them
    const spread = p.spread;
    // folded, each wing rolls outward to lie on the curve of the back
    this.wingL.rotation.set(0.52 + spread * 1.0 + p.wingL, spread * 0.3, 0.06);
    this.wingR.rotation.set(-0.52 - spread * 1.0 - p.wingR, -spread * 0.3, 0.06);
    // folded wings are painted on the body; the wing meshes only show when they open
    const open = Math.max(spread, Math.abs(p.wingL), Math.abs(p.wingR));
    this.wingL.visible = this.wingR.visible = open > 0.06;
    const lid = 1 - 0.9 * Math.min(1, p.blink);
    for (const e of this.eyes) e.scale.set(1, lid, 0.55);
    // paddle is the feet's swing (-1..1); they work in turn
    const swing = p.paddle;
    this.feet[0].rotation.set(0, 0.25, swing * 0.7);
    this.feet[1].rotation.set(0, -0.25, -swing * 0.7);
    this.legs[0].rotation.z = swing * 0.35;
    this.legs[1].rotation.z = -swing * 0.35;
    // tucked away in flight
    const tuck = Math.min(1, p.lift * 2);
    for (const foot of this.feet) foot.position.x = 0.02 - tuck * 0.18;
    for (const leg of this.legs) leg.position.x = 0.02 - tuck * 0.12;
  }

  dispose(): void {
    this.legGeometry?.dispose();
    super.dispose();
  }
}
