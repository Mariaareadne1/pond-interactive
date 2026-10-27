import * as THREE from 'three';
import { LIGHTING_GLSL, NOISE_GLSL, WORLD_UNIFORMS_GLSL } from '../scene/shaderChunks';
import type { WorldUniforms } from '../scene/world';
import { CREATURE_ALBEDO_GLSL } from './paint';

/**
 * One painted material for every creature part. Each part chooses its paint
 * with `uPart` (see paint.ts); everything else is shared: the reveal (a
 * watercolour bloom in water, MEADOW's brush sweep on land), flat colour
 * first and then light and shade, the gouache light ramp with lavender shade,
 * the underwater tint for anything below the surface, the wet edge of fresh
 * paint, and the soft blue selection rim.
 */

export const PART = {
  fishBody: 0, fishFin: 1, fishEye: 2,
  duckBody: 10, duckHead: 11, duckBill: 12, duckWing: 13, duckEye: 14, duckFoot: 15,
  frogBody: 20, frogLimb: 21, frogEye: 22, frogThroat: 23, frogTongue: 24,
  lilyPad: 30, lilyPetal: 31, lilyCentre: 32,
} as const;

export interface CreatureUniforms {
  [name: string]: THREE.IUniform;
  uReveal: THREE.IUniform<number>;
  uRevealMode: THREE.IUniform<number>;
  uRevealOrigin: THREE.IUniform<THREE.Vector3>;
  uRevealDir: THREE.IUniform<THREE.Vector3>;
  uRevealRadius: THREE.IUniform<number>;
  uSeed: THREE.IUniform<number>;
  uHighlight: THREE.IUniform<number>;
  /** Per-creature look: x pattern, y variant flag (minnow / duckling), z warmth, w spare. */
  uLook: THREE.IUniform<THREE.Vector4>;
  uSwimPhase: THREE.IUniform<number>;
  uSwimAmp: THREE.IUniform<number>;
  uTurn: THREE.IUniform<number>;
  /** 0..1 extra blush (a frog's croak, a duck's fluffed feathers). */
  uFlush: THREE.IUniform<number>;
}

export function createCreatureUniforms(seed: number): CreatureUniforms {
  return {
    uReveal: { value: 1 },
    uRevealMode: { value: 1 },
    uRevealOrigin: { value: new THREE.Vector3() },
    uRevealDir: { value: new THREE.Vector3(1, 0, 0) },
    uRevealRadius: { value: 1 },
    uSeed: { value: (seed % 97) + 0.37 },
    uHighlight: { value: 0 },
    uLook: { value: new THREE.Vector4() },
    uSwimPhase: { value: 0 },
    uSwimAmp: { value: 0 },
    uTurn: { value: 0 },
    uFlush: { value: 0 },
  };
}

const CREATURE_UNIFORMS_GLSL = /* glsl */ `
uniform float uReveal;
uniform float uRevealMode;
uniform vec3 uRevealOrigin;
uniform vec3 uRevealDir;
uniform float uRevealRadius;
uniform float uSeed;
uniform float uHighlight;
uniform vec4 uLook;
uniform float uSwimPhase;
uniform float uSwimAmp;
uniform float uTurn;
uniform float uFlush;
uniform float uPart;
uniform vec3 uPartOffset;
uniform float uBend;
`;

const vertex = /* glsl */ `
${CREATURE_UNIFORMS_GLSL}
attribute float aAO;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vNormalL;
varying float vAO;
varying vec2 vUv;

// A fish's body bends behind the head: a travelling wave driven from the
// tail, plus the arc of a turn. fx is the vertex's x in the fish's frame.
float swimBend(float fx) {
  float tail = smoothstep(0.32, -0.8, fx);
  return uSwimAmp * tail * sin(uSwimPhase - fx * 6.5) + uTurn * tail * tail * 0.35;
}

void main() {
  vec3 p = position;
  vLocal = position;
  if (uBend > 0.5) p.z += swimBend(position.x + uPartOffset.x);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vNormalL = normal;
  vAO = aAO;
#ifdef USE_UV
  vUv = uv;
#else
  vUv = vec2(0.0);
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
${WORLD_UNIFORMS_GLSL}
${CREATURE_UNIFORMS_GLSL}
${NOISE_GLSL}
${LIGHTING_GLSL}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vNormalL;
varying float vAO;
varying vec2 vUv;

// The reveal. In water a drop of pigment blooms outward from the drawing's
// centre with an irregular, wet edge; on land MEADOW's brush strokes sweep
// from tail to nose. Returns closeness to the wet front; discards unpainted.
float revealClip(vec3 world) {
  if (uReveal >= 0.999) return 0.0;
  vec3 q = (world - uRevealOrigin) / uRevealRadius;
  float gap;
  if (uRevealMode > 0.5) {
    vec2 w = world.xz / uRevealRadius;
    float n = vnoise(w * 4.0 + uSeed) * 0.62 + vnoise(w * 11.0 - uSeed) * 0.38;
    float d = length(q.xz) + abs(q.y) * 0.25;
    gap = uReveal * 1.5 - (d * 0.9 + n * 0.45);
  } else {
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), uRevealDir));
    float along = dot(q, uRevealDir);
    vec2 across = vec2(dot(q, side), q.y);
    float stroke = vnoise(across * vec2(7.0, 11.0) + uSeed) * 0.62 + vnoise(vec2(along * 4.0, across.y * 28.0)) * 0.38;
    gap = uReveal * 1.25 - ((along * 0.5 + 0.5) * 0.8 + stroke * 0.42);
  }
  if (gap < 0.0) discard;
  return 1.0 - smoothstep(0.0, 0.15, gap);
}

float shadeIn() { return smoothstep(0.45, 1.0, uReveal); }

${CREATURE_ALBEDO_GLSL}

void main() {
  float front = revealClip(vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;

  float alpha = 1.0;
  float softness = 0.25;
  float keep = 0.0; // how much the paint keeps its own colour in shade (eyes, petals)
  vec3 albedo = creatureAlbedo(alpha, softness, keep, N);
  if (alpha < 0.03) discard;

  float sunVis = castLight(vWorld, 0.025);
  float ao = mix(0.55, 1.0, smoothstep(0.1, 0.9, vAO));
  vec3 lit = paintLight(albedo, N, sunVis, ao, softness);
  // a soft painted highlight on the sunlit side
  lit += albedo * smoothstep(0.75, 0.98, dot(N, normalize(uSunDir + V))) * 0.18 * sunVis * (1.0 - keep);
  lit = mix(lit, albedo, keep);
  vec3 flatPaint = albedo * mix(vec3(1.0), uShadeColor, 0.12);
  vec3 col = mix(flatPaint, lit, shadeIn());
  // beneath the surface: tinted and softened by the water
  col = underwater(col, -vWorld.y);
  // the wet edge of fresh paint pools a little darker
  col = mix(col, col * 0.82, smoothstep(0.5, 0.95, front) * 0.75);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  col += vec3(0.12, 0.3, 0.75) * uHighlight * rim * 0.6;
  gl_FragColor = vec4(col, alpha);
}
`;

export type CreatureMaterial = THREE.ShaderMaterial;

export function createPartMaterial(
  world: WorldUniforms,
  creature: CreatureUniforms,
  part: number,
  options: { bend?: boolean; offset?: THREE.Vector3; doubleSided?: boolean; uv?: boolean; cutout?: boolean } = {},
): CreatureMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...world,
      ...creature,
      uPart: { value: part },
      uPartOffset: { value: options.offset ?? new THREE.Vector3() },
      uBend: { value: options.bend ? 1 : 0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    alphaToCoverage: !!options.cutout,
  });
  if (options.uv) material.defines = { USE_UV: 1 };
  return material;
}

/** Depth-only twin for the sun's shadow map: shares the swim bend, so a fish's shadow swims too. */
export function createPartDepthMaterial(creature: CreatureUniforms, options: { bend?: boolean; offset?: THREE.Vector3 } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...creature,
      uPart: { value: 0 },
      uPartOffset: { value: options.offset ?? new THREE.Vector3() },
      uBend: { value: options.bend ? 1 : 0 },
    },
    vertexShader: vertex,
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
    side: THREE.DoubleSide,
  });
}
