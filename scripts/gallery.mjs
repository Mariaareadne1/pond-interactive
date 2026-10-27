// Regenerates the documentation stills (deterministic simulation steps, UI hidden unless noted).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('artifacts/gallery', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });

async function open(query, w = 1440, h = 900) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:5352/?${query}`);
  await page.waitForFunction(() => {
    const m = window.__meadow;
    return m && !m.store.get().loading && m.store.doc.sheep.every((s) => m.engine.flock.isFormed(s.id));
  }, null, { timeout: 90000 });
  await page.waitForTimeout(6000);
  return page;
}
async function still(page, name, fn = '', ui = false) {
  await page.evaluate(({ fn, ui }) => {
    const m = window.__meadow;
    m.store.set({ uiHidden: !ui });
    m.engine.stop();
    if (fn) new Function('m', fn)(m);
    m.engine.tick(0);
  }, { fn, ui });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `artifacts/gallery/${name}.png` });
  await page.evaluate(() => window.__meadow.engine.start());
}
const step = (n) => `for (let i = 0; i < ${n}; i++) m.engine.tick(1/60);`;
const place = (x, z, heading, beh = 'idle') => `const s = m.store.doc.sheep[0]; m.app.loadDoc({version:1, sheep:[{...s, id:'one', x:${x}, z:${z}, heading:${heading}, behavior:'${beh}'}]}); m.engine.flock.update(0);`;

let p = await open('');
await still(p, '01-initial', '', true);
await p.close();

p = await open('showcase');
await still(p, '08-several-depths', step(90));
await still(p, '07-leap', `m.engine.flock.jump('hero'); ${step(40)}`);
await still(p, '06-grazing', `m.engine.flock.get('hero').controller.setBehavior('grazing'); ${step(90)}`);
await still(p, '10-selected', `m.store.set({ selectedId: 'grazer' }); ${step(30)}`, true);
await p.close();

p = await open('empty');
await p.evaluate(() => window.__meadow.app.loadDoc({ version: 2, sheep: [{ id: 'one', x: 1.5, z: 10.5, heading: -0.4, seed: 11, size: 1, behavior: 'idle' }] }));
await p.waitForFunction(() => window.__meadow.engine.flock.isFormed('one'), null, { timeout: 30000 });
await still(p, '04-foreground', step(60));
await still(p, '05-far', `m.app.engine.flock.dragTo('one', 4, -11); ${step(60)}`);
await p.close();

p = await open('showcase', 390, 844);
await still(p, '09-mobile', step(60), true);
await p.close();
await browser.close();
console.log('gallery done');
