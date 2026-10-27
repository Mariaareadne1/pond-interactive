// Frame-time benchmark: renders N frames back-to-back with a GPU sync each frame.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
for (const [w, h, sheep] of [[1440, 900, 1], [1440, 900, 12], [1920, 1080, 12]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
  await page.goto('http://localhost:5352/?empty');
  await page.waitForFunction(() => window.__meadow && !window.__meadow.store.get().loading, null, { timeout: 90000 });
  const ms = await page.evaluate(async (n) => {
    const m = window.__meadow;
    const doc = { version: 1, sheep: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, x: -6 + (i % 4) * 4, z: -9 - Math.floor(i / 4) * 9, heading: i, seed: i * 3, size: 1, behavior: ['idle', 'grazing', 'walking'][i % 3] })) };
    m.app.loadDoc(doc);
    await new Promise((r) => setTimeout(r, 15000)); // let all fleece variants build
    m.engine.stop();
    const gl = m.engine.renderer.getContext();
    for (let i = 0; i < 20; i++) m.engine.tick(1 / 60);
    gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) { m.engine.tick(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
    return (performance.now() - t0) / 120;
  }, sheep);
  console.log(`${w}x${h} dpr${process.env.DPR ?? 1} sheep=${sheep}: ${ms.toFixed(2)} ms/frame (${(1000 / ms).toFixed(0)} fps uncapped)`);
  await page.close();
}
await browser.close();
