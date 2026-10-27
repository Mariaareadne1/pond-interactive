import { Controller, headingTo, wrapAngle, type PondSense } from './base';
import { CATCH, CROAK, frogPose, HOP, hopHeight, hopTravel, type FrogState } from '../behaviors/frog';
import { FROG_KEYS, ramp, type FrogKey, type Frame } from '../pose';
import { clampToBank, groundHeight, isBank } from '../../scene/pondShape';
import { seededRandom } from '../../scene/noise';

interface HopTarget {
  x: number;
  z: number;
  padId: string | null;
}

/**
 * A frog's life: sitting on the bank or a lily pad (riding the pad as it
 * bobs and drifts), hopping to the nearest pad or a spot on the bank,
 * catching a fly, croaking, looking up at the rain.
 */
export class FrogController extends Controller<FrogKey, FrogState> {
  /** The pad it sits on, and where on the pad (in the pad's own frame). */
  perch: string | null;
  private perchOffset = { u: 0, v: 0 };
  private hop: { from: { x: number; z: number; y: number; heading: number }; to: HopTarget; landed: boolean; heading: number } | null = null;
  private readonly rand: () => number;
  private y = 0;

  constructor(seed: number, x: number, z: number, heading: number, perch: string | null) {
    super(FROG_KEYS, seed, x, z, heading, 'sit');
    this.perch = perch;
    this.rand = seededRandom(seed * 31 + 7);
    this.y = groundHeight(x, z);
  }

  get busy(): boolean {
    return this.state === 'hop';
  }

  /** Where it is heading, if it's mid-hop to a pad. */
  get hopPad(): string | null {
    return this.hop?.to.padId ?? null;
  }

  /** Set the perch from outside (load, drag onto a pad) and remember the offset on it. */
  sitOn(padId: string | null, sense: PondSense): void {
    this.perch = padId;
    const pad = padId ? sense.pad(padId) : null;
    if (!pad) {
      this.perch = null;
      return;
    }
    const dx = this.x - pad.x;
    const dz = this.z - pad.z;
    const c = Math.cos(pad.heading);
    const s = Math.sin(pad.heading);
    this.perchOffset = { u: dx * c - dz * s, v: dx * s + dz * c };
  }

  hopTo(target: HopTarget | null, sense: PondSense): boolean {
    if (this.state === 'hop') return false;
    const to = target ?? this.chooseHop(sense);
    if (!to) return false;
    // it turns to face the target while it crouches, rather than snapping round
    this.hop = { from: { x: this.x, z: this.z, y: this.y, heading: this.heading }, to, landed: false, heading: headingTo(this.x, this.z, to.x, to.z) };
    this.enter('hop', 0.12);
    return true;
  }

  catchFly(): void {
    if (this.state !== 'hop') this.enter('catch', 0.25);
  }

  croak(): void {
    if (this.state !== 'hop') this.enter('croak', 0.2);
  }

  lookUp(): void {
    if (this.state === 'sit') this.enter('lookUp', 0.5);
  }

  sit(): void {
    if (this.state !== 'hop') this.enter('sit', 0.5);
  }

  /** Nearest free pad within reach; else a fresh spot on the bank. */
  private chooseHop(sense: PondSense): HopTarget | null {
    const reach = 5.5;
    let best: HopTarget | null = null;
    let bestD = reach;
    for (const pad of sense.pads()) {
      if (pad.id === this.perch || sense.padTaken(pad.id, '')) continue;
      const d = Math.hypot(pad.x - this.x, pad.z - this.z);
      if (d < bestD) {
        bestD = d;
        best = { x: pad.x, z: pad.z, padId: pad.id };
      }
    }
    if (best) return best;
    // no pad: hop along the bank (or from a pad back to the nearest bank)
    for (let i = 0; i < 16; i++) {
      const a = this.heading + (this.rand() - 0.5) * (i < 8 ? 1.6 : 6.2);
      const d = (1.2 + this.rand() * 1.2) * Math.max(1, this.scale);
      const x = this.x + Math.cos(a) * d;
      const z = this.z - Math.sin(a) * d;
      if (isBank(x, z)) return { x, z, padId: null };
    }
    const [x, z] = clampToBank(this.x, this.z);
    return Math.hypot(x - this.x, z - this.z) > 0.3 ? { x, z, padId: null } : null;
  }

  private padPosition(sense: PondSense, padId: string, u: number, v: number): { x: number; z: number; y: number } | null {
    const pad = sense.pad(padId);
    if (!pad) return null;
    const c = Math.cos(pad.heading);
    const s = Math.sin(pad.heading);
    return { x: pad.x + u * c + v * s, z: pad.z - u * s + v * c, y: pad.y };
  }

  update(dt: number, sense: PondSense): Frame<FrogKey> {
    this.advance(dt);
    if (this.state === 'hop' && this.hop) {
      const h = this.hop;
      const live = h.to.padId ? sense.pad(h.to.padId) : null;
      const tx = live ? live.x : h.to.x;
      const tz = live ? live.z : h.to.z;
      const ty = live ? live.y : groundHeight(tx, tz);
      const k = hopTravel(this.stateTime);
      this.heading = wrapAngle(h.from.heading + wrapAngle(h.heading - h.from.heading) * ramp(this.stateTime, 0, HOP.launch));
      const dist = Math.hypot(tx - h.from.x, tz - h.from.z);
      this.x = h.from.x + (tx - h.from.x) * k;
      this.z = h.from.z + (tz - h.from.z) * k;
      this.y = h.from.y + (ty - h.from.y) * k + hopHeight(this.stateTime, dist) * Math.max(0.8, this.scale);
      if (this.stateTime > HOP.launch && this.stateTime - dt <= HOP.launch && this.perch) sense.touchPad(this.perch, this.x, this.z, 0.6);
      if (!h.landed && this.stateTime >= HOP.land) {
        h.landed = true;
        if (h.to.padId && live) {
          this.perch = h.to.padId;
          this.perchOffset = { u: 0, v: 0 };
          sense.touchPad(h.to.padId, h.from.x, h.from.z, 1);
          sense.ripple(tx, tz, 0.9);
        } else {
          this.perch = null;
        }
      }
      if (this.stateTime >= HOP.duration) {
        this.hop = null;
        this.settle(0.25);
        this.onMoved?.(this.x, this.z);
      }
    } else {
      if (this.state === 'catch' && this.stateTime >= CATCH.duration) this.enter('sit', 0.4);
      if (this.state === 'croak' && this.stateTime >= CROAK.duration) this.enter('sit', 0.4);
      if (this.state === 'croak' && this.perch && Math.abs(this.stateTime - 0.3) < dt) sense.touchPad(this.perch, this.x, this.z, 0.25);
      if (this.perch && !this.held) {
        const p = this.padPosition(sense, this.perch, this.perchOffset.u, this.perchOffset.v);
        if (p) {
          this.x = p.x;
          this.z = p.z;
          this.y = p.y;
        } else {
          // its pad went away under it: hop to the bank
          this.perch = null;
          this.hopTo(null, sense);
        }
      } else this.y = groundHeight(this.x, this.z);
    }
    const pose = frogPose(this.state, this.stateTime, this.seed);
    const shown = this.shown(pose);
    this.heading = wrapAngle(this.heading);
    return { x: this.x, y: this.y, z: this.z, heading: this.heading, pose: shown, phase: 0 };
  }
}
