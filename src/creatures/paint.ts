/**
 * The creatures' paint, before light: what colour each part is at each point
 * of its own frame (vLocal, x toward the nose, y up). Gouache-flat fields
 * with soft internal gradients and a little pigment grain, no gloss.
 *
 * uLook: koi x = pattern (0 kohaku, 1 tancho, 2 sanke, 3 yamabuki), y = 1 for a minnow;
 * duck y = 1 for a duckling; frog z = warmth; lily x = pad hue shift.
 */
export const CREATURE_ALBEDO_GLSL = /* glsl */ `
vec3 grain(vec3 c, float scale) { return c * (0.95 + 0.08 * vnoise3(vLocal * scale + uSeed)); }

// --- fish -------------------------------------------------------------------
vec3 koiSkin(vec3 p, out float orange) {
  vec3 cream = srgb(vec3(0.97, 0.94, 0.87));
  vec3 persimmon = srgb(vec3(0.95, 0.50, 0.24));
  vec3 sumi = srgb(vec3(0.24, 0.22, 0.25));
  float top = smoothstep(-0.05, 0.05, p.y + 0.02);
  float pat = uLook.x;
  float blobs = vnoise3(p * vec3(6.0, 7.0, 7.0) + uSeed * 1.7) * 0.7 + vnoise3(p * 15.0 + uSeed) * 0.3;
  orange = 0.0;
  if (pat < 0.5) orange = smoothstep(0.47, 0.53, blobs) * top;                         // kohaku: patches
  else if (pat < 1.5) orange = smoothstep(0.075, 0.06, length(vec2(p.x - 0.32, p.z) * vec2(1.0, 1.3))) * top; // tancho: a red cap
  else if (pat < 2.5) orange = smoothstep(0.5, 0.56, blobs) * top;                    // sanke: patches and ink
  else orange = 0.85 + 0.15 * top;                                                    // yamabuki: all gold-orange
  vec3 c = mix(cream, pat > 2.5 ? srgb(vec3(0.96, 0.66, 0.30)) : persimmon, orange);
  if (pat > 1.5 && pat < 2.5) {
    float ink = smoothstep(0.66, 0.7, vnoise3(p * 11.0 - uSeed * 2.3)) * top * step(p.x, 0.25);
    c = mix(c, sumi, ink);
  }
  // a faint scale pattern, painted not modelled
  float sc = sin(p.x * 120.0 + sin(p.z * 120.0) * 1.6) * 0.5 + 0.5;
  c *= 0.97 + 0.04 * sc * top;
  return c;
}

vec3 minnowSkin(vec3 p) {
  vec3 back = srgb(vec3(0.56, 0.64, 0.58));
  vec3 belly = srgb(vec3(0.90, 0.92, 0.88));
  vec3 c = mix(belly, back, smoothstep(-0.03, 0.06, p.y + abs(p.z) * -0.2));
  float stripe = smoothstep(0.012, 0.0, abs(abs(p.z) - 0.05 - p.y * 0.4)) * smoothstep(0.3, -0.1, p.x);
  return mix(c, srgb(vec3(0.82, 0.86, 0.84)), stripe * 0.5);
}

vec3 fishAlbedo(inout float alpha, inout float softness, inout float keep, vec3 N) {
  vec3 p = vLocal;
  if (uPart < 0.5) {
    float orange;
    vec3 c = uLook.y > 0.5 ? minnowSkin(p) : koiSkin(p, orange);
    // the head is a little rounder and paler at the lips
    c = mix(c, c * 1.04 + 0.02, smoothstep(0.4, 0.48, p.x));
    softness = 0.35;
    return grain(c, 60.0);
  }
  if (uPart < 1.5) {
    // fins: thin, pale, with fine rays radiating from the root; translucent toward the edge
    float r = length(p.xz);
    float a = atan(p.z, -p.x);
    float rays = smoothstep(0.55, 0.95, sin(a * 38.0) * 0.5 + 0.5);
    float orange;
    vec3 base = uLook.y > 0.5 ? srgb(vec3(0.82, 0.86, 0.82)) : koiSkin(vec3(-0.3, 0.05, p.z * 0.4), orange);
    base = mix(base, srgb(vec3(0.98, 0.95, 0.9)), 0.35);
    vec3 c = base * (1.0 - rays * 0.08);
    alpha = 0.92 - 0.5 * smoothstep(0.08, 0.36, r) + 0.08 * vnoise(p.xz * 40.0);
    softness = 0.5;
    keep = 0.15;
    return c;
  }
  // eye: dark with a single catchlight
  float cl = smoothstep(0.86, 0.95, dot(vNormalL, normalize(vec3(0.3, 0.9, 0.0))));
  keep = 0.6;
  return mix(srgb(vec3(0.07, 0.06, 0.07)), vec3(1.0), cl);
}

// --- duck -------------------------------------------------------------------
vec3 duckAlbedo(inout float alpha, inout float softness, inout float keep, vec3 N) {
  vec3 p = vLocal;
  bool duckling = uLook.y > 0.5;
  vec3 cream = duckling ? srgb(vec3(0.99, 0.91, 0.62)) : srgb(vec3(0.96, 0.92, 0.84));
  vec3 brown = duckling ? srgb(vec3(0.66, 0.52, 0.32)) : srgb(vec3(0.62, 0.44, 0.29));
  if (uPart < 10.5) {
    // body: cream chest and sides; the folded wings are painted on, warm brown
    // teardrops along each side of the back with cream-edged tips and a teal mirror
    vec3 c = cream * (1.0 - 0.04 * smoothstep(0.0, 0.2, p.y));
    float wx = clamp((0.14 - p.x) / 0.5, 0.0, 1.0);          // 0 at the shoulder .. 1 at the tip
    float wHalf = 0.075 * sin(3.1416 * pow(wx, 0.7)) + 0.01;
    float wCentre = 0.12 - 0.04 * wx;
    float wing = smoothstep(0.012, -0.01, abs(abs(p.z) - wCentre) - wHalf) * smoothstep(0.06, 0.12, p.y) * step(p.x, 0.15);
    vec3 wingCol = mix(brown, mix(brown, cream, 0.3), wx * 0.6) * (0.94 + 0.1 * vnoise(p.xz * 28.0));
    float tips = smoothstep(0.75, 0.95, sin(p.x * 46.0 + abs(p.z) * 16.0)) * smoothstep(0.45, 0.8, wx);
    wingCol = mix(wingCol, cream, tips * 0.4);
    if (!duckling) {
      float mirror = smoothstep(0.03, 0.0, length(vec2((p.x + 0.12) * 0.8, abs(p.z) - wCentre - wHalf * 0.4)));
      wingCol = mix(wingCol, srgb(vec3(0.3, 0.52, 0.6)), mirror * 0.75);
    }
    c = mix(c, wingCol, wing);
    // a warm buff saddle between the wings, and soft scallops on the back
    float saddle = smoothstep(0.18, 0.24, p.y) * smoothstep(0.1, -0.15, p.x) * (1.0 - wing);
    c = mix(c, mix(cream, brown, 0.32), saddle);
    float scal = smoothstep(0.7, 0.95, sin(p.x * 60.0 + abs(p.z) * 30.0) * sin(p.z * 50.0));
    c *= 1.0 - scal * 0.04 * smoothstep(0.1, 0.2, p.y);
    c = mix(c, c * 1.05 + 0.02 * uFlush, uFlush);
    // white feathers take the shade gently: a cool grey, never lilac
    softness = 0.45;
    keep = 0.3;
    return grain(c, 50.0);
  }
  if (uPart < 11.5) {
    // head and neck: warm brown, a darker crown, a paler throat and cheek
    vec3 c = duckling ? mix(cream, brown, smoothstep(0.05, 0.12, p.y)) : brown;
    if (!duckling) {
      c = mix(c, c * 0.78, smoothstep(0.06, 0.13, p.y));
      c = mix(c, mix(brown, cream, 0.55), smoothstep(-0.08, -0.16, p.y) * smoothstep(-0.02, 0.06, p.x));
      // a soft dark eye stripe
      c = mix(c, c * 0.72, smoothstep(0.016, 0.0, abs(p.y - 0.02 - (p.x - 0.05) * 0.2)) * step(-0.08, p.x) * 0.7);
    }
    softness = 0.3;
    return grain(c, 70.0);
  }
  if (uPart < 12.5) {
    vec3 c = srgb(vec3(0.97, 0.62, 0.30));
    c = mix(c, srgb(vec3(0.55, 0.36, 0.26)), smoothstep(0.13, 0.15, p.x) * 0.7);
    softness = 0.3;
    return c;
  }
  if (uPart < 13.5) {
    // wing: brown, cream-edged feather tips, and a small teal mirror
    vec3 c = mix(brown, mix(brown, cream, 0.35), smoothstep(0.0, -0.3, p.x)) * (0.95 + 0.08 * vnoise(p.xz * 30.0));
    // soft scalloped feather edges toward the tips
    float tips = smoothstep(0.7, 0.95, sin(p.x * 48.0 + abs(p.z) * 18.0));
    c = mix(c, cream, tips * smoothstep(-0.16, -0.3, p.x) * 0.35);
    if (!duckling) {
      float mirror = smoothstep(0.035, 0.0, length(vec2(p.x + 0.17, (abs(p.z) - 0.06) * 0.7)));
      c = mix(c, srgb(vec3(0.3, 0.52, 0.6)), mirror * 0.7);
    }
    softness = 0.3;
    return grain(c, 60.0);
  }
  if (uPart < 14.5) {
    float cl = smoothstep(0.86, 0.95, dot(vNormalL, normalize(vec3(0.4, 0.85, 0.0))));
    keep = 0.6;
    return mix(srgb(vec3(0.06, 0.05, 0.05)), vec3(1.0), cl);
  }
  softness = 0.4;
  return srgb(vec3(0.96, 0.58, 0.28));
}

// --- frog -------------------------------------------------------------------
vec3 frogAlbedo(inout float alpha, inout float softness, inout float keep, vec3 N) {
  vec3 p = vLocal;
  vec3 green = mix(srgb(vec3(0.44, 0.70, 0.30)), srgb(vec3(0.52, 0.72, 0.30)), uLook.z);
  vec3 belly = srgb(vec3(0.95, 0.92, 0.76));
  if (uPart < 20.5) {
    vec3 c = green;
    // darker freckles on the back, a pale stripe along each side
    float spots = smoothstep(0.62, 0.66, vnoise3(p * 9.0 + uSeed)) * smoothstep(0.2, 0.3, p.y);
    c = mix(c, c * 0.62, spots * 0.8);
    float stripe = smoothstep(0.02, 0.0, abs(abs(p.z) - 0.19 + p.x * 0.12)) * smoothstep(0.18, 0.28, p.y) * smoothstep(0.22, -0.2, p.x);
    c = mix(c, c * 1.18 + 0.03, stripe * 0.6);
    // cream underneath, rising to a soft line along the jaw
    float under = smoothstep(0.16, 0.08, p.y + max(0.0, p.x - 0.1) * 0.25);
    c = mix(c, belly, under);
    // the mouth: a fine dark line across the front of the head, curling up at the corners
    float mouth = smoothstep(0.01, 0.0, abs(p.y - 0.165 - abs(p.z) * abs(p.z) * 0.9)) * smoothstep(0.12, 0.22, p.x);
    c = mix(c, srgb(vec3(0.2, 0.28, 0.16)), mouth * 0.8);
    // nostrils
    float nose = smoothstep(0.012, 0.004, length(vec2(p.x - 0.36, abs(p.z) - 0.045))) * step(0.24, p.y);
    c *= 1.0 - nose * 0.4;
    // a faint blush on the cheeks
    float cheek = smoothstep(0.06, 0.0, length(vec2(p.x - 0.22, p.y - 0.2)) ) * smoothstep(0.17, 0.22, abs(p.z));
    c = mix(c, srgb(vec3(0.85, 0.55, 0.45)), cheek * 0.35);
    softness = 0.3;
    return grain(c, 55.0);
  }
  if (uPart < 21.5) {
    vec3 c = mix(green, green * 0.72, smoothstep(0.5, 0.9, sin(p.x * 40.0) * 0.5 + 0.5) * 0.45);
    // only the soles and the undersides pale toward cream
    c = mix(c, mix(green, belly, 0.45), smoothstep(-0.1, -0.16, p.y) * 0.8);
    softness = 0.3;
    return grain(c, 55.0);
  }
  if (uPart < 22.5) {
    // gold iris, dark pupil looking out, one catchlight
    vec3 n = vec3(vNormalL.x, vNormalL.y, abs(vNormalL.z));
    vec3 pd = n - normalize(vec3(0.45, 0.45, 0.77));
    float pupil = smoothstep(0.27, 0.22, length(vec2(pd.y * 2.4, length(pd.xz) * 0.9)));
    vec3 c = mix(srgb(vec3(0.78, 0.68, 0.36)), srgb(vec3(0.08, 0.07, 0.06)), pupil);
    c = mix(c, vec3(1.0), smoothstep(0.93, 0.97, dot(n, normalize(vec3(0.2, 0.9, 0.4)))));
    // the lid: green over the top back of the eye
    c = mix(c, green, smoothstep(0.86, 0.93, n.y - n.x * 0.2));
    keep = 0.4;
    return c;
  }
  if (uPart < 23.5) {
    softness = 0.4;
    return mix(belly, srgb(vec3(0.97, 0.84, 0.74)), uFlush);
  }
  softness = 0.4;
  return srgb(vec3(0.92, 0.52, 0.56));
}

// --- lily -------------------------------------------------------------------
vec3 lilyAlbedo(inout float alpha, inout float softness, inout float keep, vec3 N) {
  vec3 p = vLocal;
  if (uPart < 30.5) {
    float r = vUv.x;
    float a = vUv.y;
    vec3 sage = srgb(vec3(0.33, 0.52, 0.31)) * (1.0 + uLook.x * vec3(0.06, 0.03, -0.04));
    vec3 c = sage * (0.92 + 0.12 * vnoise(p.xz * 6.0 + uSeed));
    // paler veins radiating from the centre
    float vein = smoothstep(0.08, 0.0, abs(fract(a * 22.0 / 6.2832 + vnoise(p.xz * 3.0) * 0.15) - 0.5) - 0.42);
    c = mix(c, srgb(vec3(0.56, 0.70, 0.45)), vein * smoothstep(0.08, 0.3, r) * 0.55);
    c = mix(c, srgb(vec3(0.62, 0.73, 0.46)), smoothstep(0.12, 0.0, r) * 0.6);
    // a lighter rim, its very edge rose-bronze where the pad turns over
    c = mix(c, c * 1.14, smoothstep(0.75, 0.95, r));
    c = mix(c, srgb(vec3(0.62, 0.43, 0.36)), smoothstep(0.955, 0.995, r) * 0.8);
    // the odd yellowing blemish
    c = mix(c, srgb(vec3(0.62, 0.66, 0.38)), smoothstep(0.74, 0.84, vnoise(p.xz * 7.0 - uSeed)) * 0.2);
    softness = 0.25;
    return c;
  }
  if (uPart < 31.5) {
    float t = clamp(p.x / 0.21, 0.0, 1.0);
    vec3 c = mix(srgb(vec3(0.99, 0.96, 0.9)), srgb(vec3(0.95, 0.62, 0.70)), smoothstep(0.45, 1.0, t));
    c = mix(c, srgb(vec3(0.98, 0.9, 0.62)), smoothstep(0.25, 0.0, t) * 0.5);
    softness = 0.5;
    keep = 0.2;
    return c;
  }
  keep = 0.25;
  return srgb(vec3(0.98, 0.80, 0.30)) * (0.9 + 0.15 * vnoise(p.xz * 90.0));
}

vec3 creatureAlbedo(inout float alpha, inout float softness, inout float keep, vec3 N) {
  if (uPart < 9.5) return fishAlbedo(alpha, softness, keep, N);
  if (uPart < 19.5) return duckAlbedo(alpha, softness, keep, N);
  if (uPart < 29.5) return frogAlbedo(alpha, softness, keep, N);
  return lilyAlbedo(alpha, softness, keep, N);
}
`;
