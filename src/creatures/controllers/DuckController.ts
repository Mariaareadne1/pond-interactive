import { Controller, headingTo, type PondSense } from './base';
import { DABBLE, duckPose, flightAt, FLY, PREEN, SHAKE, type DuckState, type FlightPlan } from '../behaviors/duck';
import { DUCK_KEYS, type DuckKey, type Frame } from '../pose';
import { clampToWater, edgeDistance, isWater, shoreGradient, WATER_Y } from '../../scene/pondShape';
import { noise2 } from '../../scene/noise';

const LEASH = 3.6;
const WAKE_EVERY = 0.42;

/**
 * A duck's life: paddling slowly about with a little wake, dabbling tail-up,
 * preening, flying a loop over the pond and skidding back down, shaking off
 * rain, paddling over to crumbs. A duckling follows its parent in a line.
 */
export class DuckController extends Controller<DuckKey, DuckState> {
  private plan: FlightPlan | null = null;
  private wakeTimer = 0;
  private wakeSide = 1;
  private speed = 0;
  private crumbId: number | null = null;
  private flightMarks = { run: 0, landed: false };
  /** For ducklings: who to follow and where in the line. */
  parentId: string | null = null;
  lineIndex = 0;

  constructor(seed: number, x: number, z: number, heading: number, parentId: string | null) {
    super(DUCK_KEYS, seed, x, z, heading, parentId ? 'follow' : 'paddle');
    this.parentId = parentId;
  }

  get busy(): boolean {
    return this.state === 'fly' || this.state === 'dabble' || this.state === 'preen';
  }

  get airborne(): boolean {
    return this.state === 'fly';
  }

  setParent(parentId: string | null): void {
    this.parentId = parentId;
    this.base = parentId ? 'follow' : 'paddle';
    if (this.state === 'paddle' || this.state === 'follow') this.enter(this.base, 0.4);
  }

  dabble(): void {
    if (!this.airborne) this.enter('dabble', 0.3);
  }

  preen(): void {
    if (!this.airborne) this.enter('preen', 0.3);
  }

  shake(): void {
    if (!this.busy) this.enter('shake', 0.2);
  }

  feed(): void {
    if (this.busy) return;
    this.crumbId = null;
    this.enter('feed', 0.4);
  }

  fly(): void {
    if (this.airborne) return;
    this.plan = this.planFlight();
    this.flightMarks = { run: 0, landed: false };
    this.enter('fly', 0.25);
  }

  /** Pick a heading and loop that keep the duck over the tile and land it on open water. */
  private planFlight(): FlightPlan {
    const candidates: FlightPlan[] = [];
    for (const d of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
      for (const turn of [1, -1] as const) candidates.push({ x: this.x, z: this.z, heading: this.heading + d, radius: 3.2, turn });
    }
    const fits = (p: FlightPlan) => {
      const land = flightAt(p, FLY.duration);
      if (!isWater(land.x, land.z, 0.6)) return false;
      for (let t = 0; t <= FLY.duration; t += 0.25) {
        const q = flightAt(p, t);
        if (edgeDistance(q.x, q.z) < 0.8) return false;
        if (t < FLY.runEnd && !isWater(q.x, q.z, 0.2)) return false;
      }
      return true;
    };
    const plan = candidates.find(fits) ?? candidates.find((p) => isWater(flightAt(p, FLY.duration).x, flightAt(p, FLY.duration).z, 0.4));
    // nowhere good to go (a tight corner): a short hop of a loop on the spot
    return plan ?? { x: this.x, z: this.z, heading: this.heading, radius: 1.2, turn: 1 };
  }

  private avoidShore(dt: number): void {
    const look = 1.1 * this.scale;
    const ax = this.x + Math.cos(this.heading) * look;
    const az = this.z - Math.sin(this.heading) * look;
    if (!isWater(ax, az, 0.55 * this.scale)) {
      const [gx, gz] = shoreGradient(ax, az);
      this.steerToward(Math.atan2(gz, -gx), 1.8, dt);
    }
  }

  private move(distance: number): void {
    let nx = this.x + Math.cos(this.heading) * distance;
    let nz = this.z - Math.sin(this.heading) * distance;
    if (!isWater(nx, nz, 0.4 * this.scale)) [nx, nz] = clampToWater(nx, nz, 0.4 * this.scale);
    this.x = nx;
    this.z = nz;
  }

  private wake(dt: number, sense: PondSense): void {
    this.wakeTimer += dt;
    if (this.speed < 0.08 || this.wakeTimer < WAKE_EVERY) return;
    this.wakeTimer = 0;
    this.wakeSide = -this.wakeSide;
    // rings shed alternately off each side of the tail make a soft V behind
    const bx = this.x - Math.cos(this.heading) * 0.45 * this.scale + Math.sin(this.heading) * this.wakeSide * 0.18 * this.scale;
    const bz = this.z + Math.sin(this.heading) * 0.45 * this.scale + Math.cos(this.heading) * this.wakeSide * 0.18 * this.scale;
    sense.ripple(bx, bz, 0.28 + this.speed * 0.4);
  }

  private paddle(dt: number, sense: PondSense): void {
    // drift, pause, drift: speed rises and falls on a slow noise
    const want = (0.16 + 0.22 * Math.max(0, noise2(this.time * 0.12, this.seed * 2.3) + 0.3)) * this.scale;
    this.speed += (want - this.speed) * Math.min(1, dt * 0.8);
    this.heading += noise2(this.time * 0.18, this.seed * 4.1) * 0.6 * dt;
    if (Math.hypot(this.anchorX - this.x, this.anchorZ - this.z) > LEASH * this.scale) {
      this.steerToward(headingTo(this.x, this.z, this.anchorX, this.anchorZ), 0.7, dt);
    }
    this.avoidShore(dt);
    this.move(this.speed * dt);
    this.wake(dt, sense);
  }

  private seek(tx: number, tz: number, maxSpeed: number, dt: number, sense: PondSense): number {
    const d = Math.hypot(tx - this.x, tz - this.z);
    this.steerToward(headingTo(this.x, this.z, tx, tz), 1.6, dt);
    const want = maxSpeed * Math.min(1, d / (0.9 * this.scale));
    this.speed += (want - this.speed) * Math.min(1, dt * 2);
    this.avoidShore(dt);
    this.move(this.speed * dt);
    this.wake(dt, sense);
    return d;
  }

  update(dt: number, sense: PondSense): Frame<DuckKey> {
    this.advance(dt);
    let y = WATER_Y;
    if (!this.held) {
      switch (this.state) {
        case 'paddle':
          this.paddle(dt, sense);
          break;
        case 'follow': {
          const parent = this.parentId ? sense.positionOf(this.parentId) : null;
          if (!parent || parent.y > 0.3) {
            // parent away (or flying): potter about nearby
            this.paddle(dt, sense);
            break;
          }
          const back = (0.85 + this.lineIndex * 0.75) * Math.max(1, this.scale * 1.4);
          const tx = parent.x - Math.cos(parent.heading) * back;
          const tz = parent.z + Math.sin(parent.heading) * back;
          if (this.seek(tx, tz, 0.9 * Math.max(0.6, this.scale * 1.5), dt, sense) < 0.25) this.steerToward(parent.heading, 1, dt);
          this.anchorX = this.x;
          this.anchorZ = this.z;
          break;
        }
        case 'feed': {
          const crumbs = sense.crumbs();
          let crumb = crumbs.find((c) => c.id === this.crumbId) ?? null;
          if (!crumb) {
            let best = 9;
            for (const c of crumbs) {
              const d = Math.hypot(c.x - this.x, c.z - this.z);
              if (d < best) {
                best = d;
                crumb = c;
              }
            }
            this.crumbId = crumb?.id ?? null;
          }
          if (!crumb) {
            this.settle();
            break;
          }
          if (this.seek(crumb.x, crumb.z, 0.75 * this.scale, dt, sense) < 0.4 * this.scale) {
            sense.eatCrumb(crumb.id);
            sense.ripple(crumb.x, crumb.z, 0.5);
            this.crumbId = null;
          }
          break;
        }
        case 'dabble':
          this.speed *= 1 - Math.min(1, dt * 2);
          this.move(this.speed * dt);
          if (this.stateTime > 0.5 && this.stateTime - dt <= 0.5) sense.ripple(this.x + Math.cos(this.heading) * 0.35 * this.scale, this.z - Math.sin(this.heading) * 0.35 * this.scale, 0.8);
          if (this.stateTime > 2.45 && this.stateTime - dt <= 2.45) sense.ripple(this.x, this.z, 0.7);
          if (this.stateTime >= DABBLE.duration) this.settle();
          break;
        case 'preen':
          this.speed *= 1 - Math.min(1, dt * 2);
          this.move(this.speed * dt);
          if (this.stateTime >= PREEN.duration) this.settle();
          break;
        case 'shake':
          if (this.stateTime > 0.4 && this.stateTime - dt <= 0.4) sense.ripple(this.x, this.z, 0.6);
          if (this.stateTime >= SHAKE.duration) this.enter(this.base, 0.3);
          break;
        case 'fly': {
          const plan = this.plan!;
          const f = flightAt(plan, this.stateTime);
          this.x = f.x;
          this.z = f.z;
          this.heading = f.heading;
          y = WATER_Y + f.y;
          this.speed = 0;
          // feet pattering on the water during the take-off run
          if (this.stateTime < FLY.runEnd + 0.2 && this.stateTime - this.flightMarks.run > 0.13) {
            this.flightMarks.run = this.stateTime;
            sense.ripple(f.x, f.z, 0.45);
          }
          if (!this.flightMarks.landed && this.stateTime >= FLY.glideEnd) {
            this.flightMarks.landed = true;
            sense.ripple(f.x, f.z, 1.4);
            sense.splash(f.x, f.z, 0.7);
          }
          if (this.stateTime >= FLY.duration) {
            this.settle(0.4);
            this.onMoved?.(this.x, this.z);
          }
          break;
        }
      }
    }
    const pose = duckPose(this.state, this.stateTime, this.seed, Math.min(1, this.speed / (0.4 * this.scale)));
    const shown = this.shown(pose);
    return { x: this.x, y, z: this.z, heading: this.heading, pose: shown, phase: 0 };
  }
}
