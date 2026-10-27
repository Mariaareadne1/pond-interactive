import { Controller, type PondSense } from './base';
import { BLOOM_TIME, DRIFT, driftTravel, lilyPose } from '../behaviors/lily';
import { LILY_KEYS, smooth, type Frame, type LilyKey } from '../pose';
import { clampToWater, isWater, WATER_Y } from '../../scene/pondShape';
import type { FlowerState } from '../types';

type LilyState = 'still' | 'drift';

/** Pad thickness above the water (m, at size 1). */
export const PAD_TOP = 0.035;

/**
 * A lily pad: floating still with a faint bob, bobbing and tilting when
 * something touches it, drifting slowly on the current and settling, and its
 * flower opening or closing.
 */
export class LilyController extends Controller<LilyKey, LilyState> {
  private touchAt = -100;
  private touchStrength = 0;
  private touchDir = 0;
  private openFrom = 0;
  private openTo = 0;
  private openAt = -100;
  private drift: { x: number; z: number; dx: number; dz: number; spin: number; from: number } | null = null;
  private spinOffset = 0;

  constructor(seed: number, x: number, z: number, heading: number, flower: FlowerState) {
    super(LILY_KEYS, seed, x, z, heading, 'still');
    this.openFrom = this.openTo = flower === 'open' ? 1 : 0;
  }

  get radius(): number {
    return 0.5 * this.scale;
  }

  touch(fromX: number, fromZ: number, strength: number): void {
    // tilt away from whatever touched it, down on the near side
    this.touchDir = Math.atan2(this.z - fromZ, fromX - this.x) - this.heading;
    this.touchStrength = Math.min(1.2, strength);
    this.touchAt = this.time;
  }

  setFlower(state: FlowerState): void {
    const target = state === 'open' ? 1 : 0;
    if (target === this.openTo) return;
    this.openFrom = this.openNow();
    this.openTo = target;
    this.openAt = this.time;
  }

  private openNow(): number {
    const u = Math.min(1, (this.time - this.openAt) / BLOOM_TIME);
    return this.openFrom + (this.openTo - this.openFrom) * smooth(Math.max(0, u));
  }

  startDrift(breezeDir?: number): void {
    if (this.state === 'drift') return;
    // drift with the breeze, or toward the open middle of the pond
    let dir = breezeDir ?? Math.atan2(-0.3 - this.z, 0.6 - this.x) + (Math.sin(this.seed) * 0.6);
    let dx = Math.cos(dir);
    let dz = Math.sin(dir);
    const d = DRIFT.distance * Math.max(1, this.scale * 0.8);
    if (!isWater(this.x + dx * d, this.z + dz * d, this.radius * 0.8)) {
      dir = Math.atan2(-0.3 - this.z, 0.6 - this.x);
      dx = Math.cos(dir);
      dz = Math.sin(dir);
    }
    this.drift = { x: this.x, z: this.z, dx: dx * d, dz: dz * d, spin: (this.seed % 2 ? 1 : -1) * DRIFT.spin, from: this.heading };
    this.enter('drift', 0.5);
  }

  update(dt: number, sense: PondSense): Frame<LilyKey> {
    this.advance(dt);
    if (this.state === 'drift' && this.drift && !this.held) {
      const k = driftTravel(this.stateTime);
      let x = this.drift.x + this.drift.dx * k;
      let z = this.drift.z + this.drift.dz * k;
      if (!isWater(x, z, this.radius * 0.7)) [x, z] = clampToWater(x, z, this.radius * 0.7);
      this.x = x;
      this.z = z;
      this.heading = this.drift.from + this.drift.spin * k;
      if (this.stateTime >= DRIFT.duration) {
        this.drift = null;
        this.settle(0.5);
        this.onMoved?.(this.x, this.z);
      }
    }
    // a breeze turns pads slowly
    this.spinOffset += sense.breeze * 0.08 * dt * (this.seed % 2 ? 1 : -1);
    const pose = lilyPose({
      t: this.time,
      seed: this.seed,
      sinceTouch: this.time - this.touchAt,
      touch: this.touchStrength,
      touchDir: this.touchDir,
      open: this.openNow(),
      breeze: sense.breeze,
    });
    pose.spin += this.spinOffset;
    const shown = this.shown(pose);
    return { x: this.x, y: WATER_Y + 0.01, z: this.z, heading: this.heading, pose: shown, phase: 0 };
  }

  /** The live heading including breeze turn (frogs on the pad turn with it). */
  get liveHeading(): number {
    return this.heading + (this.lastPose?.spin ?? 0);
  }
}
