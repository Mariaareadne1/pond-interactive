// Scripted ~21 s demo, recorded by the app's own compositing recorder.
// node scripts/demo.mjs [width] [height]  ->  artifacts/meadow-demo.mp4
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const [W = '1920', H = '1080'] = process.argv.slice(2);
const w = Number(W), h = Number(H);
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5352/?empty');
await page.evaluate(() => localStorage.clear());
await page.waitForFunction(() => window.__meadow && !window.__meadow.store.get().loading, null, { timeout: 90000 });
await page.waitForTimeout(9000); // let all fleece variants finish building

const sleep = (ms) => page.waitForTimeout(ms);
const X = (f) => f * w, Y = (f) => f * h;

async function draw(cx, cy, s, facing = 1, ms = 1100) {
  const pts = [];
  for (let i = 0; i <= 70; i++) {
    const t = (i / 70) * Math.PI * 2 + 0.3;
    const head = Math.exp(-((((t - 0.3) % (Math.PI * 2)) - 5.5) ** 2) / 0.14);
    const wob = Math.sin(t * 5) * 2.5;
    pts.push([cx + facing * (Math.cos(t) * 62 + head * 30 + wob) * s, cy + (Math.sin(t) * 36 - head * 24 + wob * 0.6) * s]);
  }
  await page.mouse.move(...pts[0]);
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    await page.mouse.move(...p);
    await sleep(ms / pts.length);
  }
  await page.mouse.up();
}

async function box(id) {
  return page.evaluate((i) => {
    const m = window.__meadow, b = m.engine.flock.get(i).sheep.bounds(), cam = m.engine.camera;
    const c = b.getCenter(b.min.clone()).project(cam);
    return [((c.x + 1) / 2) * innerWidth, ((1 - c.y) / 2) * innerHeight];
  }, id);
}

async function drag(id, tx, ty, ms) {
  const [x, y] = await box(id);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const n = Math.round(ms / 16);
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t * t * (3 - 2 * t);
    await page.mouse.move(x + (tx - x) * e, y + (ty - y) * e);
    await sleep(16);
  }
  await page.mouse.up();
  await page.evaluate(() => window.__meadow.store.set({ selectedId: null }));
}

await page.evaluate(() => {
  const m = window.__meadow;
  m.store.set({ uiHidden: true });
  m.engine.adaptive = false;
  window.__demoDone = new Promise((r) => (window.__finishDemo = r));
  window.__demo = import('/src/capture/recorder.ts').then(({ recordCanvas }) =>
    recordCanvas(m.engine.canvas, { seconds: 40, ink: document.querySelector('svg.ink'), until: window.__demoDone }),
  );
});

await sleep(2200);
await draw(X(0.5), Y(0.74), 1.6);                        // a loop on the hillside
const formed = (n) => page.waitForFunction((n) => {
  const m = window.__meadow, ids = m.store.doc.sheep.map((s) => s.id);
  return ids.length >= n && ids.every((i) => m.engine.flock.isFormed(i));
}, n, { timeout: 30000 });
await formed(1);
await sleep(500);
let ids = await page.evaluate(() => window.__meadow.store.doc.sheep.map((s) => s.id));
await drag(ids[0], X(0.58), Y(0.32), 2300);              // across to the far side: it shrinks
await sleep(500);
await drag(ids[0], X(0.47), Y(0.8), 2100);               // back down: wool and dimension
await sleep(500);
await draw(X(0.36), Y(0.6), 1.0, -1, 900);               // two more
await sleep(300);
await draw(X(0.77), Y(0.66), 1.1, 1, 900);
await formed(3);
await sleep(300);
ids = await page.evaluate(() => window.__meadow.store.doc.sheep.map((s) => s.id));
await page.evaluate((ids) => {
  const m = window.__meadow;
  m.app.setBehavior('grazing', ids[1]);
  m.engine.flock.jump(ids[2]);
  setTimeout(() => m.engine.flock.jump(ids[2]), 700);
  setTimeout(() => m.engine.flock.jump(ids[0]), 1300);
}, ids);
await sleep(4200);
await page.evaluate(() => window.__finishDemo());
const out = await page.evaluate(async () => {
  const rec = await window.__demo;
  const buf = new Uint8Array(await rec.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { b64: btoa(bin), ext: rec.extension, ms: rec.durationMs, type: rec.type };
});
const file = `artifacts/meadow-demo.${out.ext}`;
writeFileSync(file, Buffer.from(out.b64, 'base64'));
console.log(file, out.type, `${(out.ms / 1000).toFixed(1)} s`);
await browser.close();
