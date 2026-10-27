import { blendPose, type Frame, type Pose } from '../pose';

/** What creatures can perceive and do to the pond around them (provided by the manager). */
export interface PadInfo {
  id: string;
  x: number;
  z: number;
  /** Top of the pad's surface (bob included). */
  y: number;
  radius: number;
  heading: number;
}

export interface PondSense {
  readonly time: number;
  readonly breeze: number;
  pads(): readonly PadInfo[];
  pad(id: string): PadInfo | null;
  crumbs(): readonly { id: number; x: number; z: number }[];
  eatCrumb(id: number): void;
  /** Live position of another creature (for schooling and ducklings). */
  positionOf(id: string): { x: number; z: number; heading: number; y: number } | null;
  ripple(x: number, z: number, strength: number): void;
  splash(x: number, z: number, strength: number): void;
  touchPad(id: string, fromX: number, fromZ: number, strength: number): void;
  /** Is another frog already sitting on (or hopping to) this pad? */
  padTaken(padId: string, exceptFrog: string): boolean;
}

/** A sense with nothing in it: for tests and a creature on its own. */
export const EMPTY_SENSE: PondSense = {
  time: 0,
  breeze: 0,
  pads: () => [],
  pad: () => null,
  crumbs: () => [],
  eatCrumb: () => {},
  positionOf: () => null,
  ripple: () => {},
  splash: () => {},
  touchPad: () => {},
  padTaken: () => false,
};

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The heading that faces from (x, z) toward (tx, tz); forward is (cos h, -sin h). */
export const headingTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tz - z), tx - x);

/**
 * The machinery every creature shares: a state with its own clock, a base
 * state it returns to, and a cross-fade from the pose actually shown (so a
 * flurry of clicks can never leave a fin, wing or leg stranded).
 */
export abstract class Controller<K extends string, S extends string> {
  state: S;
  stateTime = 0;
  x: number;
  z: number;
  heading: number;
  anchorX: number;
  anchorZ: number;
  /** World metres per local unit (the view's root scale). */
  scale = 1;
  /** Held by a drag: root motion pauses, the pose keeps living. */
  held = false;
  /** Fired when a one-shot leaves the creature somewhere new. */
  onMoved: ((x: number, z: number) => void) | null = null;
  protected lastPose: Pose<K> | null = null;
  private fromPose: Pose<K> | null = null;
  private blendTime = 0;
  private blendDuration = 0.4;
  protected time = 0;

  constructor(protected readonly keys: readonly K[], readonly seed: number, x: number, z: number, heading: number, protected base: S) {
    this.state = base;
    this.x = this.anchorX = x;
    this.z = this.anchorZ = z;
    this.heading = heading;
  }

  protected enter(state: S, blend = 0.4): void {
    this.fromPose = this.lastPose;
    this.blendTime = 0;
    this.blendDuration = blend;
    this.state = state;
    this.stateTime = 0;
  }

  /** Back to the base state, anchored wherever the creature now is. */
  protected settle(blend = 0.35): void {
    this.anchorX = this.x;
    this.anchorZ = this.z;
    this.enter(this.base, blend);
  }

  /** Teleport (drag, undo): moves the anchor too, and keeps the current animation. */
  placeAt(x: number, z: number): void {
    this.x = this.anchorX = x;
    this.z = this.anchorZ = z;
  }

  protected advance(dt: number): void {
    this.stateTime += dt;
    this.blendTime += dt;
    this.time += dt;
  }

  /** Cross-fade the behaviour's pose with whatever was showing when the state changed. */
  protected shown(pose: Pose<K>): Pose<K> {
    let out = pose;
    if (this.fromPose && this.blendTime < this.blendDuration) {
      const w = this.blendTime / this.blendDuration;
      out = blendPose(this.keys, this.fromPose, pose, w * w * (3 - 2 * w));
    }
    this.lastPose = out;
    return out;
  }

  /** Turn toward a heading at a limited rate (rad/s). Returns the turn actually made this frame. */
  protected steerToward(desired: number, rate: number, dt: number): number {
    const diff = wrapAngle(desired - this.heading);
    const turn = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    this.heading = wrapAngle(this.heading + turn);
    return turn;
  }

  abstract update(dt: number, sense: PondSense): Frame<K>;
}
