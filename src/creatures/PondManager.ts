import * as THREE from 'three';
import { loadShapes, type ShapeSet } from './geometry/cache';
import { CreatureView } from './views/CreatureView';
import { FishView } from './views/FishView';
import { DuckView } from './views/DuckView';
import { FrogView } from './views/FrogView';
import { LilyView } from './views/LilyView';
import { FishController } from './controllers/FishController';
import { DuckController } from './controllers/DuckController';
import { FrogController } from './controllers/FrogController';
import { LilyController, PAD_TOP } from './controllers/LilyController';
import type { Controller, PadInfo, PondSense } from './controllers/base';
import type { Frame } from './pose';
import { rootScale } from './scale';
import { CATCH } from './behaviors/frog';
import type { CreatureRecord, PondDoc } from '../state/document';
import type { WorldUniforms } from '../scene/world';
import type { Ripples } from '../scene/water';
import type { PondLife } from '../scene/life';
import { isWater } from '../scene/pondShape';
import { formationOrigin, type FormationRequest } from './formation';
import { onLand } from './habitat';

/**
 * Keeps the living pond in step with the document. The document says what
 * exists and where it was put; controllers own the moment-to-moment life;
 * this class lets creatures notice each other (pads, crumbs, leaders),
 * paints them in, and answers picking and actions.
 */

type AnyController = FishController | DuckController | FrogController | LilyController;
type AnyView = FishView | DuckView | FrogView | LilyView;

interface Entry {
  record: CreatureRecord;
  controller: AnyController;
  view: AnyView | null;
  formation: { t: number; req: FormationRequest } | null;
  lastFrame: Frame<string> | null;
  padTouchCooldown: number;
}

const FADE_IN_DURATION = 0.6;
const LEAVE_DURATION = 0.45;

export class PondManager {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, FormationRequest>();
  private readonly leaving: { view: CreatureView; t: number }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private shapes: ShapeSet | null = null;
  private time = 0;
  private breezeLeft = 0;
  breeze = 0;
  /** (id, x, z) when a one-shot leaves a creature somewhere new. */
  onMoved: ((id: string, x: number, z: number) => void) | null = null;
  /** A frog changed perch (landed on a pad, or hopped off one). */
  onPerch: ((id: string, perch: string | null) => void) | null = null;
  onReady: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;
  viewportHeight = 900;

  constructor(
    private readonly world: WorldUniforms,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly ripples: Ripples,
    readonly life: PondLife,
  ) {
    this.group.name = 'creatures';
  }

  get size(): number {
    return this.entries.size;
  }

  preload(): void {
    loadShapes()
      .then((s) => {
        this.shapes = s;
        for (const e of this.entries.values()) if (!e.view) this.buildView(e);
        this.onReady?.();
      })
      .catch((e: Error) => this.onError?.(e.message));
  }

  get ready(): boolean {
    return this.shapes !== null;
  }

  /** The next creature with this id should be painted in from a drawing. */
  expectFormation(id: string, req: FormationRequest): void {
    this.pending.set(id, req);
  }

  sync(doc: PondDoc): void {
    const seen = new Set<string>();
    // pads first, so frogs created in the same sync can find their perch
    const ordered = [...doc.creatures].sort((a, b) => Number(b.kind === 'lily') - Number(a.kind === 'lily'));
    for (const record of ordered) {
      seen.add(record.id);
      const entry = this.entries.get(record.id);
      if (!entry) this.create(record);
      else this.updateEntry(entry, record);
    }
    for (const [id, entry] of this.entries) if (!seen.has(id)) this.remove(id, entry);
    this.relineDucklings();
  }

  private makeController(r: CreatureRecord): AnyController {
    switch (r.kind) {
      case 'fish': return new FishController(r.seed, r.x, r.z, r.heading, !!r.minnow);
      case 'duck': return new DuckController(r.seed, r.x, r.z, r.heading, r.parent ?? null);
      case 'frog': return new FrogController(r.seed, r.x, r.z, r.heading, r.perch ?? null);
      case 'lily': return new LilyController(r.seed, r.x, r.z, r.heading, r.flower ?? 'none');
    }
  }

  private create(record: CreatureRecord): void {
    const controller = this.makeController(record);
    controller.scale = rootScale(record);
    controller.onMoved = (x, z) => this.onMoved?.(record.id, x, z);
    const entry: Entry = { record, controller, view: null, formation: null, lastFrame: null, padTouchCooldown: 0 };
    this.entries.set(record.id, entry);
    if (controller instanceof FrogController && record.perch) controller.sitOn(record.perch, this.sense);
    if (this.shapes) this.buildView(entry);
  }

  private buildView(entry: Entry): void {
    const s = this.shapes!;
    const r = entry.record;
    let view: AnyView;
    switch (r.kind) {
      case 'fish': view = new FishView(r.id, r.seed, r.minnow ? s.minnow : s.koi, this.world, !!r.minnow); break;
      case 'duck': view = new DuckView(r.id, r.seed, s.duck, this.world); break;
      case 'frog': view = new FrogView(r.id, r.seed, s.frog, this.world); break;
      case 'lily': view = new LilyView(r.id, r.seed, s.lily, this.world); break;
    }
    this.applyLook(view, r);
    view.root.scale.setScalar(entry.controller.scale);
    view.root.rotation.y = r.heading;
    const req = this.pending.get(r.id) ?? null;
    this.pending.delete(r.id);
    const fallback: FormationRequest = { origin: formationOrigin(r), radius: entry.controller.scale * 0.8, duration: FADE_IN_DURATION, mode: onLand(r.kind, r.x, r.z) ? 0 : 1 };
    entry.formation = { t: 0, req: req ?? fallback };
    view.setFormation(0, entry.formation.req.origin, entry.formation.req.radius, entry.formation.req.mode);
    entry.view = view;
    this.group.add(view.root);
  }

  private applyLook(view: AnyView, r: CreatureRecord): void {
    const look = view.uniforms.uLook.value;
    const h = ((r.seed * 9301 + 49297) % 233280) / 233280;
    if (r.kind === 'fish') look.set(r.pattern ?? 0, r.minnow ? 1 : 0, h, 0);
    if (r.kind === 'duck') look.set(0, r.parent ? 1 : 0, h, 0);
    if (r.kind === 'frog') look.set(0, 0, h, 0);
    if (r.kind === 'lily') look.set(h * 2 - 1, 0, 0, 0);
    if (view instanceof LilyView) view.setFlower(r.flower ?? 'none');
  }

  private updateEntry(entry: Entry, record: CreatureRecord): void {
    const prev = entry.record;
    entry.record = record;
    const c = entry.controller;
    if (prev.x !== record.x || prev.z !== record.z) c.placeAt(record.x, record.z);
    if (prev.heading !== record.heading) c.heading = record.heading;
    if (prev.size !== record.size || prev.parent !== record.parent) {
      c.scale = rootScale(record);
      entry.view?.root.scale.setScalar(c.scale);
    }
    if (c instanceof LilyController && prev.flower !== record.flower) {
      const v = entry.view as LilyView | null;
      if (record.flower !== 'none') v?.setFlower(record.flower ?? 'none');
      c.setFlower(record.flower ?? 'none');
      if (record.flower === 'none') v?.setFlower('none');
    }
    if (c instanceof DuckController && prev.parent !== record.parent) {
      c.setParent(record.parent ?? null);
      if (entry.view) this.applyLook(entry.view, record);
    }
    if (c instanceof FrogController && prev.perch !== record.perch && c.perch !== (record.perch ?? null)) c.sitOn(record.perch ?? null, this.sense);
    if (entry.view && (prev.pattern !== record.pattern || prev.minnow !== record.minnow)) this.applyLook(entry.view, record);
  }

  private remove(id: string, entry: Entry, animate = true): void {
    this.entries.delete(id);
    const view = entry.view;
    if (!view) return;
    if (!animate) {
      view.dispose();
      return;
    }
    // fade back out of the water like ink lifting off the page
    view.setFormation(1, view.root.position.clone(), entry.controller.scale * 0.8);
    this.leaving.push({ view, t: 0 });
  }

  /** Ducklings line up behind their parent in the order they were made. */
  private relineDucklings(): void {
    const counts = new Map<string, number>();
    for (const e of this.entries.values()) {
      const c = e.controller;
      if (c instanceof DuckController && c.parentId) {
        const n = counts.get(c.parentId) ?? 0;
        c.lineIndex = n;
        counts.set(c.parentId, n + 1);
      }
    }
  }

  // --- what creatures can sense -------------------------------------------------

  readonly sense: PondSense = {
    time: 0,
    breeze: 0,
    pads: () => this.padInfos(),
    pad: (id) => this.padInfo(id),
    crumbs: () => this.life.crumbs(),
    eatCrumb: (id) => this.life.eatCrumb(id),
    positionOf: (id) => {
      const e = this.entries.get(id);
      return e ? { x: e.controller.x, z: e.controller.z, heading: e.controller.heading, y: e.lastFrame?.y ?? 0 } : null;
    },
    ripple: (x, z, s) => {
      if (isWater(x, z, -0.1)) this.ripples.add(x, z, s);
    },
    splash: (x, z, s) => this.life.splash(x, z, s),
    touchPad: (id, fx, fz, s) => {
      const e = this.entries.get(id);
      if (e?.controller instanceof LilyController) {
        e.controller.touch(fx, fz, s);
        this.ripples.add(e.controller.x, e.controller.z, 0.35 * s);
      }
    },
    padTaken: (padId, except) => {
      for (const [id, e] of this.entries) {
        if (id === except || !(e.controller instanceof FrogController)) continue;
        if (e.controller.perch === padId || e.controller.hopPad === padId) return true;
      }
      return false;
    },
  };

  private padInfo(id: string): PadInfo | null {
    const e = this.entries.get(id);
    if (!e || !(e.controller instanceof LilyController)) return null;
    const c = e.controller;
    const bob = e.lastFrame ? (e.lastFrame.pose as Record<string, number>).bob ?? 0 : 0;
    return { id, x: c.x, z: c.z, y: 0.01 + bob + PAD_TOP * c.scale, radius: c.radius, heading: c.liveHeading };
  }

  private padInfos(): PadInfo[] {
    const out: PadInfo[] = [];
    for (const id of this.entries.keys()) {
      const p = this.padInfo(id);
      if (p) out.push(p);
    }
    return out;
  }

  // --- frame ------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.breezeLeft = Math.max(0, this.breezeLeft - dt);
    const target = this.breezeLeft > 0 ? Math.min(1, this.breezeLeft / 1.5) : 0;
    this.breeze += (target - this.breeze) * Math.min(1, dt * 1.2);
    this.world.uBreeze.value = this.breeze;
    (this.sense as { time: number }).time = this.time;
    (this.sense as { breeze: number }).breeze = this.breeze;

    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t += dt;
      const p = 1 - l.t / LEAVE_DURATION;
      if (p <= 0) {
        l.view.dispose();
        this.leaving.splice(i, 1);
      } else l.view.setFormation(p * p);
    }

    // pads first, so riders and hiders see where pads are this frame
    const order = [...this.entries.values()].sort((a, b) => Number(b.record.kind === 'lily') - Number(a.record.kind === 'lily'));
    for (const e of order) {
      const frame = (e.controller as Controller<string, string>).update(dt, this.sense);
      e.lastFrame = frame;
      if (e.controller instanceof FrogController && e.record.kind === 'frog' && (e.record.perch ?? null) !== e.controller.perch) {
        this.onPerch?.(e.record.id, e.controller.perch);
      }
      if (e.view) {
        (e.view as { apply(f: Frame<string>): void }).apply(frame);
        if (e.formation) {
          e.formation.t += dt;
          const p = Math.min(1, e.formation.t / e.formation.req.duration);
          e.view.setFormation(p);
          if (p >= 1) e.formation = null;
        }
      }
      e.padTouchCooldown = Math.max(0, e.padTouchCooldown - dt);
    }
    this.touchPadsByDucks();
  }

  /** Ducks nudging past pads make them bob. */
  private touchPadsByDucks(): void {
    const pads = this.padInfos();
    for (const e of this.entries.values()) {
      if (!(e.controller instanceof DuckController) || e.padTouchCooldown > 0 || e.controller.airborne || e.controller.onLand) continue;
      for (const pad of pads) {
        if (Math.hypot(pad.x - e.controller.x, pad.z - e.controller.z) < pad.radius + 0.35 * e.controller.scale) {
          this.sense.touchPad(pad.id, e.controller.x, e.controller.z, 0.5);
          e.padTouchCooldown = 1.6;
        }
      }
    }
  }

  // --- queries ------------------------------------------------------------------------

  get(id: string): { view: AnyView | null; controller: AnyController; record: CreatureRecord } | undefined {
    const e = this.entries.get(id);
    return e ? { view: e.view, controller: e.controller, record: e.record } : undefined;
  }

  frameOf(id: string): Frame<string> | null {
    return this.entries.get(id)?.lastFrame ?? null;
  }

  isFormed(id: string): boolean {
    const e = this.entries.get(id);
    return !!e?.view && !e.formation;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** Nearest creature under a screen point (NDC). Forming creatures can already be picked. */
  pick(ndc: THREE.Vector2): string | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const proxies: THREE.Object3D[] = [];
    for (const e of this.entries.values()) if (e.view) proxies.push(e.view.proxy);
    const hits = this.raycaster.intersectObjects(proxies, false);
    if (!hits.length) return null;
    // prefer what is on top: a frog on a pad over the pad, a pad over the fish beneath it
    const rank = (id: string) => ({ frog: 0, duck: 1, lily: 2, fish: 3 })[this.entries.get(id)?.record.kind ?? 'fish'];
    const near = hits.filter((h) => h.distance < hits[0].distance + 1.2);
    near.sort((a, b) => rank(a.object.userData.creatureId) - rank(b.object.userData.creatureId) || a.distance - b.distance);
    return near[0].object.userData.creatureId as string;
  }

  /** Lily pad under a world point, if any (for drawing a frog onto a pad). */
  padAt(x: number, z: number, margin = 0): PadInfo | null {
    let best: PadInfo | null = null;
    let bestD = Infinity;
    for (const p of this.padInfos()) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.radius + margin && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  setHighlight(id: string | null, hoverId: string | null): void {
    for (const [eid, e] of this.entries) e.view?.setHighlight(eid === id ? 1 : eid === hoverId ? 0.45 : 0);
  }

  setHeld(id: string, held: boolean): void {
    const c = this.entries.get(id)?.controller;
    if (c) c.held = held;
  }

  dragTo(id: string, x: number, z: number): void {
    this.entries.get(id)?.controller.placeAt(x, z);
  }

  pixelsPerMeterAt(p: THREE.Vector3): number {
    const d = p.clone().applyMatrix4(this.camera.matrixWorldInverse).z * -1;
    return this.viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * Math.max(0.1, d));
  }

  // --- actions --------------------------------------------------------------------------

  private controllerOf<T extends AnyController>(id: string, type: new (...args: never[]) => T): T | null {
    const c = this.entries.get(id)?.controller;
    return c instanceof type ? c : null;
  }

  fishCome(id: string, x: number, z: number): void {
    this.controllerOf(id, FishController)?.comeTo(x, z);
  }

  /** Slip under the nearest pad. Returns false when there are no pads. */
  fishHide(id: string): boolean {
    const fish = this.controllerOf(id, FishController);
    if (!fish) return false;
    let best: PadInfo | null = null;
    let bestD = Infinity;
    for (const p of this.padInfos()) {
      const d = Math.hypot(p.x - fish.x, p.z - fish.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return false;
    fish.hideUnder(best.id);
    return true;
  }

  fishLeap(id: string): void {
    this.controllerOf(id, FishController)?.leap();
  }

  fishSwim(id: string): void {
    this.controllerOf(id, FishController)?.swim();
  }

  /** Nearby fish fall in behind this one. Returns how many joined. */
  fishSchool(id: string): number {
    const lead = this.controllerOf(id, FishController);
    if (!lead) return 0;
    const others = [...this.entries.entries()]
      .filter(([oid, e]) => oid !== id && e.controller instanceof FishController && !(e.controller as FishController).busy)
      .map(([oid, e]) => ({ oid, d: Math.hypot(e.controller.x - lead.x, e.controller.z - lead.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    // follow in a chain: each follows the one ahead, which reads as a loose school
    let ahead = id;
    for (const o of others) {
      (this.entries.get(o.oid)!.controller as FishController).follow(ahead);
      ahead = o.oid;
    }
    lead.swim();
    return others.length;
  }

  duckDabble(id: string): void {
    this.controllerOf(id, DuckController)?.dabble();
  }

  duckPreen(id: string): void {
    this.controllerOf(id, DuckController)?.preen();
  }

  duckFly(id: string): void {
    this.controllerOf(id, DuckController)?.fly();
  }

  lilyDrift(id: string): void {
    this.controllerOf(id, LilyController)?.startDrift();
  }

  /** The nearest frog hops onto this pad. Returns the frog's id, or null. */
  lilyInvite(padId: string): string | null {
    const pad = this.padInfo(padId);
    if (!pad) return null;
    let best: { id: string; c: FrogController; d: number } | null = null;
    for (const [id, e] of this.entries) {
      if (!(e.controller instanceof FrogController) || e.controller.busy) continue;
      if (e.controller.perch === padId) return id;
      const d = Math.hypot(e.controller.x - pad.x, e.controller.z - pad.z);
      if (!best || d < best.d) best = { id, c: e.controller, d };
    }
    if (!best || this.sense.padTaken(padId, best.id)) return null;
    best.c.hopTo({ x: pad.x, z: pad.z, padId }, this.sense);
    return best.id;
  }

  frogHop(id: string): boolean {
    return this.controllerOf(id, FrogController)?.hopTo(null, this.sense) ?? false;
  }

  frogCatch(id: string): void {
    const frog = this.controllerOf(id, FrogController);
    if (!frog || frog.busy) return;
    frog.catchFly();
    const k = frog.scale;
    this.life.showFly(frog.x + Math.cos(frog.heading) * 0.25 * k, (this.entries.get(id)?.lastFrame?.y ?? 0) + 0.2 * k, frog.z - Math.sin(frog.heading) * 0.25 * k, CATCH.flick + 0.05);
  }

  frogCroak(id: string): void {
    this.controllerOf(id, FrogController)?.croak();
  }

  // --- pond-wide -------------------------------------------------------------------------

  /** Sprinkle crumbs; fish and ducks within reach come for them. */
  feed(x: number, z: number): number {
    const added = this.life.sprinkle(x, z);
    if (!added) return 0;
    for (const e of this.entries.values()) {
      const c = e.controller;
      const d = Math.hypot(c.x - x, c.z - z);
      if (c instanceof FishController && d < 11) c.feed();
      // ducks on the bank stay put; ducks on the water paddle over
      if (c instanceof DuckController && !c.parentId && !c.onLand && d < 9) c.feed();
    }
    return added;
  }

  rain(seconds = 10): void {
    this.life.rain = seconds;
    for (const e of this.entries.values()) {
      const c = e.controller;
      if (c instanceof FrogController) c.lookUp();
      if (c instanceof DuckController) c.shake();
    }
    window.setTimeout(() => {
      for (const e of this.entries.values()) if (e.controller instanceof FrogController && e.controller.state === 'lookUp') e.controller.sit();
    }, seconds * 1000);
  }

  startBreeze(seconds = 10): void {
    this.breezeLeft = seconds;
  }

  get raining(): boolean {
    return this.life.rain > 0;
  }

  dispose(): void {
    for (const [id, e] of this.entries) this.remove(id, e, false);
    for (const l of this.leaving) l.view.dispose();
    this.leaving.length = 0;
  }
}
