import { Controller, headingTo, type PondSense } from './base';
import { fishPose, HIDE_DEPTH, LEAP, leapHeight, leapTravel, SWIM_DEPTH, type FishState } from '../behaviors/fish';
import { FISH_KEYS, type FishKey, type Frame } from '../pose';
import { clampToWater, isWater, shoreGradient, WATER_Y } from '../../scene/pondShape';
import { noise2 } from '../../scene/noise';

const LEASH = 4.2;
const NOSE_TIME = 1.8;
const SCHOOL_TIME = 16;

/**
 * A fish's life: gliding in unhurried S-curves near where it was put, never
 * nosing into the bank; coming to a spot and nosing the surface; slipping
 * under the nearest lily pad; leaping; falling in behind a leader; rising
 * for crumbs.
 */
export class FishController extends Controller<FishKey, FishState> {
  private phase = 0;
  private turnRate = 0;
  private target: { x: number; z: number } | null = null;
  private padId: string | null = null;
  private leaderId: string | null = null;
  private crumbId: number | null = null;
  private lastTravel = 0;
  private splashed = { launch: false, reentry: false };
  /** For the manager: id of the fish this one is following in a school. */
  get following(): string | null {
    return this.state === 'school' ? this.leaderId : null;
  }

  constructor(seed: number, x: number, z: number, heading: number, readonly minnow: boolean) {
    super(FISH_KEYS, seed, x, z, heading, 'swim');
  }

  get busy(): boolean {
    return this.state === 'leap' || this.state === 'nose';
  }

  comeTo(x: number, z: number): void {
    this.target = { x, z };
    this.enter('come', 0.3);
  }

  hideUnder(padId: string): void {
    this.padId = padId;
    this.enter('hide', 0.5);
  }

  follow(leaderId: string): void {
    this.leaderId = leaderId;
    this.enter('school', 0.5);
  }

  feed(): void {
    if (this.state === 'leap') return;
    this.crumbId = null;
    this.enter('feed', 0.4);
  }

  swim(): void {
    if (this.state !== 'leap') this.settle(0.5);
  }

  leap(): void {
    if (this.state === 'leap') return;
    this.chooseLeapHeading();
    this.lastTravel = 0;
    this.splashed = { launch: false, reentry: false };
    this.enter('leap', 0.2);
  }

  /** Turn toward open water so the leap always lands back in the pond. */
  private chooseLeapHeading(): void {
    const reach = LEAP.travel * this.scale * 1.15;
    for (const d of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6, Math.PI]) {
      const h = this.heading + d;
      const ok = [0.5, 1].every((f) => isWater(this.x + Math.cos(h) * reach * f, this.z - Math.sin(h) * reach * f, 0.5 * this.scale));
      if (ok) {
        this.heading = h;
        return;
      }
    }
  }

  private avoidShore(dt: number, speed: number): void {
    const look = 0.9 * this.scale + speed * 1.2;
    const ax = this.x + Math.cos(this.heading) * look;
    const az = this.z - Math.sin(this.heading) * look;
    if (!isWater(ax, az, 0.45 * this.scale)) {
      const [gx, gz] = shoreGradient(ax, az);
      this.turnRate += this.steerToward(Math.atan2(gz, -gx), 2.4, dt) / Math.max(dt, 1e-4);
    }
  }

  private wander(dt: number): void {
    const n = noise2(this.time * 0.22, this.seed * 3.1);
    this.turnRate += n * 0.9;
    this.heading += n * 0.9 * dt;
    if (Math.hypot(this.anchorX - this.x, this.anchorZ - this.z) > LEASH * Math.max(1, this.scale)) {
      this.turnRate += this.steerToward(headingTo(this.x, this.z, this.anchorX, this.anchorZ), 1.0, dt) / Math.max(dt, 1e-4);
    }
  }

  private move(distance: number): void {
    let nx = this.x + Math.cos(this.heading) * distance;
    let nz = this.z - Math.sin(this.heading) * distance;
    if (!isWater(nx, nz, 0.3 * this.scale)) [nx, nz] = clampToWater(nx, nz, 0.3 * this.scale);
    this.x = nx;
    this.z = nz;
  }

  private seek(tx: number, tz: number, speed: number, dt: number, rate = 1.8): number {
    const d = Math.hypot(tx - this.x, tz - this.z);
    this.turnRate += this.steerToward(headingTo(this.x, this.z, tx, tz), rate, dt) / Math.max(dt, 1e-4);
    // slow down on arrival, and while still turning hard
    const v = speed * Math.min(1, d / (0.8 * this.scale));
    this.avoidShore(dt, v);
    this.move(v * dt);
    return d;
  }

  update(dt: number, sense: PondSense): Frame<FishKey> {
    this.advance(dt);
    this.turnRate = 0;
    const s = this.scale;
    const quick = this.minnow ? 1.35 : 1;
    let depth = SWIM_DEPTH * s;

    if (!this.held) {
      switch (this.state) {
        case 'swim': {
          const v = 0.42 * quick * s;
          this.wander(dt);
          this.avoidShore(dt, v);
          this.move(v * dt);
          break;
        }
        case 'come': {
          if (!this.target || this.seek(this.target.x, this.target.z, 1.3 * quick * s, dt, 2.2) < 0.45 * s) {
            sense.ripple(this.x + Math.cos(this.heading) * 0.4 * s, this.z - Math.sin(this.heading) * 0.4 * s, 0.7);
            this.enter('nose', 0.4);
          }
          break;
        }
        case 'nose': {
          if (this.stateTime > 0.55 && this.stateTime - dt <= 0.55) sense.ripple(this.x + Math.cos(this.heading) * 0.45 * s, this.z - Math.sin(this.heading) * 0.45 * s, 0.55);
          if (this.stateTime > NOSE_TIME) this.settle();
          break;
        }
        case 'hide': {
          const pad = this.padId ? sense.pad(this.padId) : null;
          if (!pad) {
            this.settle();
            break;
          }
          const d = Math.hypot(pad.x - this.x, pad.z - this.z);
          if (d > pad.radius * 0.35) this.seek(pad.x, pad.z, 1.35 * s, dt, 3.2);
          else {
            // tucked in: drift slowly with the pad, nose turning a little
            this.x += (pad.x - this.x) * Math.min(1, dt * 0.8);
            this.z += (pad.z - this.z) * Math.min(1, dt * 0.8);
            this.heading += noise2(this.time * 0.2, this.seed) * 0.25 * dt;
          }
          const under = 1 - Math.min(1, Math.max(0, (d - pad.radius * 0.3) / pad.radius));
          depth = (SWIM_DEPTH + (HIDE_DEPTH - SWIM_DEPTH) * under) * s;
          break;
        }
        case 'school': {
          const lead = this.leaderId ? sense.positionOf(this.leaderId) : null;
          if (!lead || this.stateTime > SCHOOL_TIME) {
            this.settle();
            break;
          }
          // a loose slot behind and to one side of the leader
          const side = this.seed % 2 ? 1 : -1;
          const back = (1.3 + (this.seed % 3) * 0.45) * s;
          const tx = lead.x - Math.cos(lead.heading) * back + Math.sin(lead.heading) * side * 0.7 * s;
          const tz = lead.z + Math.sin(lead.heading) * back + Math.cos(lead.heading) * side * 0.7 * s;
          const d = Math.hypot(tx - this.x, tz - this.z);
          if (d < 0.4 * s) {
            this.steerToward(lead.heading, 1.2, dt);
            this.move(0.42 * s * dt);
          } else this.seek(tx, tz, Math.min(1.4, 0.5 + d * 0.5) * s, dt, 2.2);
          break;
        }
        case 'feed': {
          const crumbs = sense.crumbs();
          let crumb = crumbs.find((c) => c.id === this.crumbId) ?? null;
          if (!crumb) {
            let best = 10 * s;
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
          if (this.seek(crumb.x, crumb.z, 1.15 * quick * s, dt, 2.6) < 0.35 * s) {
            sense.eatCrumb(crumb.id);
            sense.ripple(crumb.x, crumb.z, 0.6);
            this.crumbId = null;
          }
          break;
        }
        case 'leap': {
          const travel = leapTravel(this.stateTime) * s;
          this.move(travel - this.lastTravel);
          this.lastTravel = travel;
          if (!this.splashed.launch && this.stateTime >= LEAP.launch) {
            this.splashed.launch = true;
            sense.ripple(this.x, this.z, 1.0);
            sense.splash(this.x, this.z, 0.6);
          }
          if (!this.splashed.reentry && this.stateTime >= LEAP.reentry) {
            this.splashed.reentry = true;
            sense.ripple(this.x, this.z, 1.5);
            sense.splash(this.x, this.z, 1.0);
          }
          if (this.stateTime >= LEAP.duration) {
            this.settle(0.3);
            this.onMoved?.(this.x, this.z);
          }
          break;
        }
      }
    }

    const pose = { ...fishPose(this.state, this.stateTime, this.seed) };
    if (this.minnow) pose.rate *= 1.3;
    // the body arcs into its turns
    pose.turn += Math.max(-0.6, Math.min(0.6, -this.turnRate * 0.35));
    const shown = this.shown(pose);
    this.phase += shown.rate * dt;
    const y = this.state === 'leap' ? WATER_Y + leapHeight(this.stateTime) * s : WATER_Y - depth - shown.sink * s;
    return { x: this.x, y, z: this.z, heading: this.heading, pose: shown, phase: this.phase };
  }
}
