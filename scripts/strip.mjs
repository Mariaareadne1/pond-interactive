// Filmstrip of one sheep's animation in the app camera.
// node scripts/strip.mjs <name> <jump|walk|graze> [frames=8] [stepFrames=6]
import { chromium } from '@playwright/test';
const [name = 'strip', what = 'jump', frames = '8', every = '6'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5352/?empty');
await page.waitForFunction(() => window.__meadow && !window.__meadow.store.get().loading, null, { timeout: 90000 });
await page.evaluate(() => window.__meadow.app.loadDoc({ version: 2, sheep: [{ id: 'one', x: 0, z: 6.5, heading: -0.15, seed: 4, size: 1.1, behavior: 'idle' }] }));
await page.waitForFunction(() => window.__meadow.engine.flock.isFormed('one'), null, { timeout: 30000 });
const box = await page.evaluate((what) => {
  const m = window.__meadow;
  m.store.set({ uiHidden: true });
  m.engine.stop();
  for (let i = 0; i < 30; i++) m.engine.tick(1 / 60);
  if (what === 'jump') m.engine.flock.jump('one');
  else m.engine.flock.setBehaviorLive('one', what === 'walk' ? 'walking' : 'grazing');
  const p = m.engine.flock.get('one').sheep.root.position.clone().project(m.engine.camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
}, what);
const files = [];
for (let f = 0; f < Number(frames); f++) {
  const file = `artifacts/${name}-${f}.png`;
  await page.screenshot({ path: file, clip: { x: box.x - 100, y: box.y - 125, width: 200, height: 150 } });
  files.push(file);
  await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__meadow.engine.tick(1 / 60); }, Number(every));
}
await browser.close();
console.log(files.join(' '));
