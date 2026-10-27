// Doodles for the QA scripts and the demo (screen px, y down); the same shapes as tests/fixtures.
export function fishPath(cx, cy, s = 1, faceLeft = false) {
  const pts = [];
  const add = (x, y) => pts.push([cx + (faceLeft ? -x : x) * s, cy + y * s]);
  for (let i = 0; i <= 20; i++) { const u = i / 20; add(70 - u * 120, -22 * Math.sin(Math.PI * (0.15 + u * 0.85)) - 2); }
  add(-62, -26); add(-78, -30); add(-66, -8); add(-58, 0); add(-66, 8); add(-80, 30); add(-62, 24);
  for (let i = 0; i <= 20; i++) { const u = i / 20; add(-50 + u * 120, 20 * Math.sin(Math.PI * (1 - u * 0.85))); }
  add(70, 0);
  return pts;
}
export function duckPath(cx, cy, s = 1, faceLeft = false) {
  const pts = [];
  const add = (x, y) => pts.push([cx + (faceLeft ? -x : x) * s, cy + y * s]);
  for (let i = 0; i <= 16; i++) { const u = i / 16; add(-60 + u * 110, 18 + 8 * Math.sin(Math.PI * u)); }
  add(56, 6); add(52, -10);
  for (let i = 0; i <= 14; i++) { const a = -0.2 + (i / 14) * Math.PI * 1.3; add(36 + Math.cos(a) * 20, -30 - Math.sin(a) * 20); }
  for (let i = 0; i <= 12; i++) { const u = i / 12; add(16 - u * 72, -10 + 4 * Math.sin(Math.PI * u)); }
  add(-66, -18); add(-64, 4);
  return pts;
}
export function loopPath(cx, cy, rx, ry = rx * 0.95) {
  const pts = [];
  for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI * 2; pts.push([cx + Math.cos(t) * (rx + Math.sin(i * 1.7) * 1.5), cy + Math.sin(t) * (ry + Math.sin(i * 0.9) * 1.5)]); }
  return pts;
}
export const SHAPES = { fish: fishPath, duck: duckPath, lily: (x, y, s) => loopPath(x, y, 46 * s), frog: (x, y, s) => loopPath(x, y, 22 * s, 18 * s) };

export async function drawPath(page, pts, steps = 2) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps });
  await page.mouse.up();
}

export async function ready(page) {
  await page.waitForFunction(() => window.__pond && !window.__pond.store.get().loading, null, { timeout: 90000 });
}
