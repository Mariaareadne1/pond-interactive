import * as THREE from 'three';
import { createCreatureUniforms, createPartDepthMaterial, createPartMaterial, type CreatureUniforms } from '../materials';
import { PROP_SHADOW_LAYER } from '../../scene/props';
import type { WorldUniforms } from '../../scene/world';
import type { Kind } from '../types';

export const SHADOW_LAYER = PROP_SHADOW_LAYER;

/** How far through the reveal before the shadow arrives (MEADOW's threshold). */
export const SHADOW_AT = 0.6;

export interface PartOptions {
  bend?: boolean;
  doubleSided?: boolean;
  uv?: boolean;
  cutout?: boolean;
  /** Where the part sits in the creature's own frame (for the swim bend). */
  offset?: THREE.Vector3;
  castShadow?: boolean;
}

/**
 * The shared half of every creature's 3D view: a root placed at its
 * position and heading, painted parts on one set of uniforms, an invisible
 * proxy for picking, the reveal (which also gates the shadow), and the
 * selection highlight.
 */
export abstract class CreatureView {
  readonly root = new THREE.Group();
  readonly uniforms: CreatureUniforms;
  readonly proxy: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly casters = new Set<THREE.Mesh>();
  private casting = true;
  formation = 1;

  constructor(readonly id: string, readonly kind: Kind, seed: number, protected readonly world: WorldUniforms) {
    this.uniforms = createCreatureUniforms(seed);
    this.root.name = `${kind}-${id}`;
    this.proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.userData.creatureId = id;
    this.root.add(this.proxy);
  }

  protected part(parent: THREE.Object3D, geo: THREE.BufferGeometry, part: number, options: PartOptions = {}): THREE.Mesh {
    const material = createPartMaterial(this.world, this.uniforms, part, options);
    const mesh = new THREE.Mesh(geo, material);
    this.materials.push(material);
    if (options.castShadow !== false) {
      mesh.layers.enable(SHADOW_LAYER);
      this.casters.add(mesh);
      if (options.bend) {
        const depth = createPartDepthMaterial(this.uniforms, options);
        mesh.userData.depthMaterial = depth;
        this.materials.push(depth);
      }
    }
    parent.add(mesh);
    return mesh;
  }

  /** 0..1 — how much of the creature is painted in. Mode 1 = watercolour bloom, 0 = brush sweep. */
  setFormation(progress: number, origin?: THREE.Vector3, radius?: number, mode?: number): void {
    this.formation = progress;
    this.uniforms.uReveal.value = progress;
    if (origin) this.uniforms.uRevealOrigin.value.copy(origin);
    if (radius) this.uniforms.uRevealRadius.value = radius;
    if (mode !== undefined) this.uniforms.uRevealMode.value = mode;
    const h = this.root.rotation.y;
    // brush strokes run from tail to nose along the creature's own heading
    this.uniforms.uRevealDir.value.set(Math.cos(h), 0, -Math.sin(h));
    const casting = progress > SHADOW_AT;
    if (casting !== this.casting) {
      this.casting = casting;
      for (const m of this.casters) {
        if (casting) m.layers.enable(SHADOW_LAYER);
        else m.layers.disable(SHADOW_LAYER);
      }
    }
  }

  get isCastingShadow(): boolean {
    return this.casting;
  }

  setHighlight(v: number): void {
    this.uniforms.uHighlight.value = v;
  }

  /** World-space bounds of the painted parts (for the selection box and tests). */
  bounds(target = new THREE.Box3()): THREE.Box3 {
    this.root.updateMatrixWorld(true);
    target.makeEmpty();
    for (const mesh of this.casters) {
      if (!mesh.visible) continue;
      let o: THREE.Object3D | null = mesh;
      let shown = true;
      while (o && shown) {
        shown = o.visible;
        o = o.parent;
      }
      if (!shown) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      target.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    }
    return target;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.proxy.geometry.dispose();
    (this.proxy.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}
