import { Controller, headingTo, wrapAngle, type PondSense } from './base';
import { DABBLE, duckPose, flightAt, FLY, PREEN, SHAKE, strideRate, type DuckState, type FlightPlan } from '../behaviors/duck';
import { DUCK_KEYS, ramp, type DuckKey, type Frame } from '../pose';
import { clampToBank, clampToWater, edgeDistance, groundHeight, isWater, shoreGradient, WATER_Y } from '../../scene/pondShape';
import { noise2, seededRandom } from '../../scene/noise';
import { bankRegion, DUCK_LAND_LIFT, duckOnLand, duckRegion, waterRegion } from '../habitat';
import { avoidRate, recover, slide, type Region } from './steer';

const LEASH = 3.6;
const WAKE_EVERY = 0.42;
/** Seconds between a duck's whims to go ashore or back into the water. */
const WHIM_MIN = 10;
const WHIM_SPREAD = 20;

/**
 * A duck's life: paddling slowly about with a little wake, dabbling tail-up,
 * preening, flying a loop over the pond and skidding back down, shaking off
 * rain, paddling over to crumbs. A duckling follows its parent in a line.
 * On the bank the same duck waddles instead, keeps to dry ground and nibbles
 * at the grass — and now and then, as it pleases, it waddles down into the
 * water or paddles out onto the bank.
 */
export class DuckController extends Controller<DuckKey, DuckState> {
  private plan: FlightPlan | null = null;
  private flyFrom = 0;
  private wakeTimer = 0;
  private wakeSide = 1;
  private speed = 0;
  private stride = 0;
  private crumbId: number | null = null;
  private crossTo: { x: number; z: number } | null = null;
  private whim: number;
  private readonly rand: () => number;
  private flightMarks = { run: 0, landed: false };
  /** For ducklings: who to follow and where in the line. */
  parentId: string | null = null;
  lineIndex = 0;
  /** Height of what it is standing or floating on (eased, so it never pops). */
  private baseY = WATER_Y;
  private land: boolean;

  constructor(seed: number, x: number, z: number, heading: number, parentId: string | null) {
    super(DUCK_KEYS, seed, x, z, heading, parentId ? 'follow' : 'paddle');
    this.parentId = parentId;
    this.rand = seededRandom(seed * 13 + 1);
    this.whim = WHIM_MIN + this.rand() * WHIM_SPREAD;
    this.land = duckOnLand(x, z);
    this.baseY = this.groundBase();
  }

  get busy(): boolean {
    return this.state === 'fly' || this.state === 'dabble' || this.state === 'preen';
  }

  get airborne(): boolean {
    return this.state === 'fly';
  }

  /** Standing on the bank (rather than floating, or flying)? */
  get onLand(): boolean {
    return this.land && !this.airborne;
  }

  /** On its way across the shore, by its own choice. */
  get crossing(): boolean {
    return this.state === 'cross';
  }

  private groundBase(): number {
    return duckOnLand(this.x, this.z) ? Math.max(WATER_Y, groundHeight(this.x, this.z)) + DUCK_LAND_LIFT * this.scale : WATER_Y;
  }

  placeAt(x: number, z: number): void {
    super.placeAt(x, z);
    this.land = duckOnLand(x, z);
    if (this.state === 'cross') this.enter(this.base, 0.3);
  }

  setParent(parentId: string | null): void {
    this.parentId = parentId;
    this.base = parentId ? 'follow' : 'paddle';
    if (this.state === 'paddle' || this.state === 'follow' || this.state === 'cross') this.enter(this.base, 0.4);
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
    this.flyFrom = this.heading;
    this.flightMarks = { run: 0, landed: false };
    this.enter('fly', 0.25);
  }

  /** Go ashore (from the water) or into the water (from the bank), right now. */
  wander(): boolean {
    if (this.busy || this.parentId) return false;
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    let target: [number, number];
    if (this.land) target = clampToWater(this.x + fx * 2.5, this.z + fz * 2.5, 1.0 * this.scale);
    else {
      // a spot a little way up the bank: ahead if that's not far out of its way, else the nearest shore
      const ahead = clampToBank(this.x + fx * 3, this.z + fz * 3);
      const nearest = clampToBank(this.x, this.z);
      const dist = (p: [number, number]) => Math.hypot(p[0] - this.x, p[1] - this.z);
      const [bx, bz] = dist(ahead) < dist(nearest) * 1.6 ? ahead : nearest;
      // then properly up the bank, away from the water, so whoever follows is out of it too
      const [gx, gz] = shoreGradient(bx, bz);
      const [ix, iz] = clampToBank(bx + gx * 1.5 * this.scale, bz + gz * 1.5 * this.scale);
      target = edgeDistance(ix, iz) > 1.6 ? [ix, iz] : [bx, bz];
    }
    if (Math.hypot(target[0] - this.x, target[1] - this.z) > 9) return false;
    this.crossTo = { x: target[0], z: target[1] };
    this.enter('cross', 0.4);
    return true;
  }

  /** Pick a heading and loop that keep the duck over the tile and land it on open water. */
  private planFlight(): FlightPlan {
    const startOnLand = this.land;
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
        // a take-off run needs open water — or, from the bank, simply somewhere on the tile
        if (t < FLY.runEnd && !startOnLand && !isWater(q.x, q.z, 0.2)) return false;
      }
      return true;
    };
    // of the plans that fit, the one whose loop circles closest to the middle of the pond
    const loopCentre = (p: FlightPlan) => {
      let x = 0;
      let z = 0;
      for (let i = 0; i < 8; i++) {
        const q = flightAt(p, FLY.climbEnd + ((FLY.loopEnd - FLY.climbEnd) * i) / 8);
        x += q.x / 8;
        z += q.z / 8;
      }
      return Math.hypot(x - 0.6, z + 0.3);
    };
    const fitting = candidates.filter(fits).sort((a, b) => loopCentre(a) - loopCentre(b));
    const plan = fitting[0] ?? candidates.find((p) => isWater(flightAt(p, FLY.duration).x, flightAt(p, FLY.duration).z, 0.4));
    // nowhere good to go (a tight corner): a short hop of a loop on the spot
    return plan ?? { x: this.x, z: this.z, heading: this.heading, radius: 1.2, turn: 1 };
  }

  /** Where it may go just now: its own side of the shore, or anywhere while crossing or following. */
  private get region(): Region {
    if (this.state === 'cross' || this.state === 'follow') return duckRegion;
    return this.land ? bankRegion : waterRegion(0.4 * this.scale);
  }

  private avoid(speed: number, wanted: number): number {
    return avoidRate(this.region, this.x, this.z, this.heading, (this.land ? 0.8 : 1.1) * this.scale + speed, 1.8, this.prefer(wanted));
  }

  private move(distance: number): void {
    [this.x, this.z] = slide(this.region, this.x, this.z, this.heading, distance);
  }

  private wake(dt: number, sense: PondSense): void {
    this.wakeTimer += dt;
    if (this.land || this.speed < 0.08 || this.wakeTimer < WAKE_EVERY) return;
    this.wakeTimer = 0;
    this.wakeSide = -this.wakeSide;
    // rings shed alternately off each side of the tail make a soft V behind
    const bx = this.x - Math.cos(this.heading) * 0.45 * this.scale + Math.sin(this.heading) * this.wakeSide * 0.18 * this.scale;
    const bz = this.z + Math.sin(this.heading) * 0.45 * this.scale + Math.cos(this.heading) * this.wakeSide * 0.18 * this.scale;
    sense.ripple(bx, bz, 0.28 + this.speed * 0.4);
  }

  private paddle(dt: number, sense: PondSense): void {
    // drift, pause, drift: speed rises and falls on a slow noise; a waddle is a little slower
    const want = (0.16 + 0.22 * Math.max(0, noise2(this.time * 0.12, this.seed * 2.3) + 0.3)) * this.scale * (this.land ? 0.7 : 1);
    this.speed += (want - this.speed) * Math.min(1, dt * 0.8);
    const away = Math.hypot(this.anchorX - this.x, this.anchorZ - this.z) / (LEASH * this.scale);
    const pull = Math.min(1, Math.max(0, (away - 1) / 0.3));
    const wander = noise2(this.time * 0.18, this.seed * 4.1) * 0.6;
    const wanted = wander * (1 - pull) + this.rateToward(headingTo(this.x, this.z, this.anchorX, this.anchorZ), 0.7) * pull;
    this.turnAt(wanted + this.avoid(this.speed, wanted), dt);
    this.move(this.speed * dt);
    this.wake(dt, sense);
  }

  private seek(tx: number, tz: number, maxSpeed: number, dt: number, sense: PondSense, rate = 1.6): number {
    const d = Math.hypot(tx - this.x, tz - this.z);
    const toward = headingTo(this.x, this.z, tx, tz);
    // slow to turn when the target is off to one side, so it never circles it
    const facing = Math.cos(wrapAngle(toward - this.heading));
    const want = maxSpeed * Math.min(1, d / (0.9 * this.scale)) * Math.max(0.2, (facing + 1) / 2) ** 1.5;
    this.speed += (want - this.speed) * Math.min(1, dt * 2);
    const wanted = this.rateToward(toward, rate);
    this.turnAt(wanted + this.avoid(this.speed, wanted), dt);
    this.move(this.speed * dt);
    this.wake(dt, sense);
    return d;
  }

  private slowDown(dt: number): void {
    this.speed *= 1 - Math.min(1, dt * 2);
    this.turnAt(0, dt, 0.3);
    this.move(this.speed * dt);
  }

  /** Notice crossing the shoreline: change gait (cross-faded) and ring the water on the way in. */
  private noticeShore(sense: PondSense): void {
    if (this.airborne) return;
    const now = duckOnLand(this.x, this.z);
    if (now === this.land) return;
    this.land = now;
    if (!now) sense.ripple(this.x + Math.cos(this.heading) * 0.3 * this.scale, this.z - Math.sin(this.heading) * 0.3 * this.scale, 0.7);
    if (this.state === 'paddle' || this.state === 'follow' || this.state === 'cross' || this.state === 'feed') {
      const t = this.stateTime;
      this.enter(this.state, 0.5);
      this.stateTime = t;
    }
  }

  update(dt: number, sense: PondSense): Frame<DuckKey> {
    this.advance(dt);
    // ease onto whatever it stands or floats on, so stepping between bank and water never pops
    this.baseY += (this.groundBase() - this.baseY) * Math.min(1, dt * (this.airborne ? 2.5 : 6));
    let y = this.baseY;
    if (!this.held) {
      if (!this.airborne) [this.x, this.z] = recover(this.region, this.x, this.z, dt, 0);
      switch (this.state) {
        case 'paddle':
          this.paddle(dt, sense);
          // a whim: go ashore, or back into the water
          this.whim -= dt;
          if (this.whim <= 0) {
            this.whim = WHIM_MIN + this.rand() * WHIM_SPREAD;
            if (this.rand() < 0.55) this.wander();
          }
          break;
        case 'cross': {
          const to = this.crossTo;
          const speed = (this.land ? 0.42 : 0.5) * this.scale;
          if (!to || this.seek(to.x, to.z, speed, dt, sense, 1.4) < 0.35 * this.scale || this.stateTime > 20) {
            this.crossTo = null;
            this.settle(0.5);
            this.onMoved?.(this.x, this.z);
          }
          break;
        }
        case 'follow': {
          const parent = this.parentId ? sense.positionOf(this.parentId) : null;
          if (!parent || parent.y > (this.land ? 1.2 : 0.3)) {
            // parent away (or flying): potter about nearby
            this.paddle(dt, sense);
            break;
          }
          // trail on a rope behind the parent (so it follows into the water or up the bank, wherever the parent goes)
          const back = (0.85 + this.lineIndex * 0.75) * Math.max(1, this.scale * 1.4);
          const rx = this.x - parent.x;
          const rz = this.z - parent.z;
          const rl = Math.hypot(rx, rz) || 1;
          const tx = parent.x + (rx / rl) * back;
          const tz = parent.z + (rz / rl) * back;
          // close in on the slot behind the parent; once there, go the way it goes — blended, not switched
          const d = Math.hypot(tx - this.x, tz - this.z);
          const k = Math.min(1, d / 0.6);
          const want = 0.9 * Math.max(0.6, this.scale * 1.5) * Math.min(1, d / (0.9 * this.scale));
          this.speed += (want - this.speed) * Math.min(1, dt * 2);
          const wanted = this.rateToward(headingTo(this.x, this.z, tx, tz), 1.6) * k + this.rateToward(parent.heading, 1) * (1 - k);
          this.turnAt(wanted + this.avoid(this.speed, wanted), dt);
          this.move(this.speed * dt);
          this.wake(dt, sense);
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
          this.slowDown(dt);
          if (this.stateTime > 0.5 && this.stateTime - dt <= 0.5) sense.ripple(this.x + Math.cos(this.heading) * 0.35 * this.scale, this.z - Math.sin(this.heading) * 0.35 * this.scale, 0.8);
          if (this.stateTime > 2.45 && this.stateTime - dt <= 2.45) sense.ripple(this.x, this.z, 0.7);
          if (this.stateTime >= DABBLE.duration) this.settle();
          break;
        case 'preen':
          this.slowDown(dt);
          if (this.stateTime >= PREEN.duration) this.settle();
          break;
        case 'shake':
          this.slowDown(dt);
          if (this.stateTime > 0.4 && this.stateTime - dt <= 0.4) sense.ripple(this.x, this.z, 0.6);
          if (this.stateTime >= SHAKE.duration) this.enter(this.base, 0.3);
          break;
        case 'fly': {
          const plan = this.plan!;
          const f = flightAt(plan, this.stateTime);
          this.x = f.x;
          this.z = f.z;
          // swing round to the take-off heading over the first moments instead of all at once
          const turnIn = ramp(this.stateTime, 0, 0.45);
          this.heading = wrapAngle(this.flyFrom + wrapAngle(f.heading - this.flyFrom) * turnIn);
          this.angVel = 0;
          y = this.baseY + f.y;
          this.speed = 0;
          // feet pattering on the water during the take-off run
          if (this.stateTime < FLY.runEnd + 0.2 && this.stateTime - this.flightMarks.run > 0.13) {
            this.flightMarks.run = this.stateTime;
            sense.ripple(f.x, f.z, 0.45);
          }
          if (!this.flightMarks.landed && this.stateTime >= FLY.glideEnd) {
            this.flightMarks.landed = true;
            sense.ripple(f.x, f.z, 1.4);
            if (isWater(f.x, f.z, 0)) sense.splash(f.x, f.z, 0.7);
          }
          if (this.stateTime >= FLY.duration) {
            this.land = duckOnLand(this.x, this.z);
            this.settle(0.4);
            this.onMoved?.(this.x, this.z);
          }
          break;
        }
      }
      this.noticeShore(sense);
    }
    const speedNorm = Math.min(1, this.speed / (0.4 * this.scale));
    this.stride += strideRate(speedNorm, this.onLand) * dt;
    const pose = duckPose(this.state, this.stateTime, this.seed, speedNorm, this.onLand, this.stride);
    const shown = this.shown(pose);
    return { x: this.x, y, z: this.z, heading: this.heading, pose: shown, phase: 0 };
  }
}
