import { expect, test, type Page } from '@playwright/test';
import { captureStats, creatures, drawStroke, frame, openPond, screenBox, state, strokes, toScreen, waitFormed } from './helpers';

/** Step the simulation by hand and report the extremes of a value along the way. */
async function sample(page: Page, id: string, seconds: number, key: string) {
  return page.evaluate(({ id, seconds, key }) => {
    const p = window.__pond!;
    p.engine.stop();
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < seconds; t += 1 / 60) {
      p.engine.tick(1 / 60);
      const f = p.engine.pond.frameOf(id)!;
      const v = key === 'y' ? f.y : key === 'x' ? f.x : (f.pose as Record<string, number>)[key];
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    p.engine.start();
    return { min, max };
  }, { id, seconds, key });
}

const centre = { x: 0.6, z: -0.3 };


test.describe('pond', () => {
  test('renders painted water, banks and paper', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openPond(page, 'showcase');
    const stats = await captureStats(page);
    expect(stats.type).toBe('image/png');
    expect(stats.paper).toBeGreaterThan(0.12);
    expect(stats.water).toBeGreaterThan(0.08);
    expect(stats.grass).toBeGreaterThan(0.08);
    expect(errors).toEqual([]);
  });

  test('drawing on the water makes fish, ducks and lily pads; on the bank a frog', async ({ page }) => {
    await openPond(page);
    const c = await toScreen(page, centre.x, 0, centre.z);
    await drawStroke(page, strokes.fish(c.x - 160, c.y - 40));
    await drawStroke(page, strokes.duck(c.x + 170, c.y - 60));
    await drawStroke(page, strokes.lily(c.x, c.y + 110));
    const bank = await toScreen(page, -10.5, 0.4, 6.5);
    await drawStroke(page, strokes.frog(bank.x, bank.y));
    const list = await creatures(page);
    expect(list.map((c) => c.kind)).toEqual(['fish', 'duck', 'lily', 'frog']);
    // the fish faces right on screen (the tail notch is on the left)
    expect(Math.cos(list[0].heading)).toBeGreaterThan(0.3);
    for (const c of list) await waitFormed(page, c.id);
  });

  test('a small loop on a lily pad becomes a frog sitting on it', async ({ page }) => {
    await openPond(page, 'showcase');
    const pad = await creatures(page).then((l) => l.find((c) => c.id === 'pad2')!);
    const p = await toScreen(page, pad.x, 0.05, pad.z);
    await drawStroke(page, strokes.frog(p.x, p.y, 0.8));
    const frog = (await creatures(page)).at(-1)!;
    expect(frog.kind).toBe('frog');
    expect(frog.perch).toBe('pad2');
  });

  test('impossible places and tiny scribbles get a gentle message instead', async ({ page }) => {
    await openPond(page);
    await drawStroke(page, strokes.fish(60, 80));
    await expect(page.locator('.toast')).toContainText('pond');
    await drawStroke(page, strokes.lily(720, 430, 0.12));
    await expect(page.locator('.toast')).toContainText('bigger');
    // a duck, forced, far up the bank
    await page.getByRole('radio', { name: 'Duck' }).click();
    const bank = await toScreen(page, -11, 0.4, 7.5);
    await drawStroke(page, strokes.duck(bank.x, bank.y, 0.6));
    await expect(page.locator('.toast')).toContainText('need water');
    // a frog, forced, in the middle of the pond
    await page.getByRole('radio', { name: 'Frog' }).click();
    const c = await toScreen(page, centre.x, 0, centre.z);
    await drawStroke(page, strokes.frog(c.x, c.y));
    await expect(page.locator('.toast')).toContainText('Frogs like');
    expect(await creatures(page)).toHaveLength(0);
  });

  test('the type picker forces a kind; an unsure drawing offers "make it a … instead"', async ({ page }) => {
    await openPond(page);
    const c = await toScreen(page, centre.x, 0, centre.z);
    await page.getByRole('radio', { name: 'Lily' }).click();
    await drawStroke(page, strokes.fish(c.x - 150, c.y));
    expect((await creatures(page))[0].kind).toBe('lily');
    await page.getByRole('radio', { name: 'Auto' }).click();
    // an in-between oval: a guess, with the other reading offered
    const { ellipse } = await import('../fixtures/drawings');
    await drawStroke(page, ellipse(c.x + 160, c.y + 40, 70, 44));
    const chip = page.locator('.instead');
    await expect(chip).toBeVisible();
    const before = (await creatures(page))[1].kind;
    await chip.locator('button').first().click();
    const after = (await creatures(page))[1].kind;
    expect(after).not.toBe(before);
    // the swap is part of the same undo step as the drawing
    await page.keyboard.press('Meta+z');
    expect(await creatures(page)).toHaveLength(1);
  });

  test('fish actions: leap leaves the water, hide goes deep under a pad, come here moves it, school gathers', async ({ page }) => {
    await openPond(page, 'showcase');
    await page.evaluate(() => window.__pond!.app.act('leap', 'koi1'));
    expect((await sample(page, 'koi1', 2.2, 'y')).max).toBeGreaterThan(1);
    const before = (await frame(page, 'koi2'))!.y;
    await page.evaluate(() => window.__pond!.app.act('hide', 'koi2'));
    await sample(page, 'koi2', 9, 'y');
    expect(await state(page, 'koi2')).toBe('hide');
    expect((await frame(page, 'koi2'))!.y).toBeLessThan(before - 0.2);
    // come here: choose it from the bar, then tap the water
    await page.evaluate(() => window.__pond!.store.set({ selectedId: 'koi3' }));
    await page.locator('.creature-bar [data-action="come"]').click({ force: true });
    const spot = await toScreen(page, -5, 0, -2);
    await page.mouse.click(spot.x, spot.y);
    // it swims there and noses the surface at the spot
    const arrived = await page.evaluate(() => {
      const p = window.__pond!;
      p.engine.stop();
      for (let t = 0; t < 12; t += 1 / 60) {
        p.engine.tick(1 / 60);
        if (p.engine.pond.get('koi3')!.controller.state === 'nose') break;
      }
      p.engine.start();
      const f = p.engine.pond.frameOf('koi3')!;
      return { state: p.engine.pond.get('koi3')!.controller.state, d: Math.hypot(f.x + 5, f.z + 2) };
    });
    expect(arrived.state).toBe('nose');
    expect(arrived.d).toBeLessThan(1.2);
    await page.evaluate(() => window.__pond!.app.act('school', 'koi1'));
    const schooling = await page.evaluate(() => ['koi2', 'koi3', 'min1'].filter((id) => window.__pond!.engine.pond.get(id)!.controller.state === 'school').length);
    expect(schooling).toBeGreaterThanOrEqual(2);
  });

  test('duck actions: dabble tips it tail-up, preen turns its head, fly lifts it into the air and back', async ({ page }) => {
    await openPond(page, 'showcase');
    await page.evaluate(() => window.__pond!.app.act('dabble', 'duck1'));
    expect((await sample(page, 'duck1', 3.6, 'pitch')).min).toBeLessThan(-1);
    await page.evaluate(() => window.__pond!.app.act('preen', 'duck1'));
    expect((await sample(page, 'duck1', 3.4, 'headYaw')).max - (await sample(page, 'duck1', 0.02, 'headYaw')).min).toBeGreaterThan(-10);
    const yaw = await sample(page, 'duck1', 0.01, 'headYaw');
    await page.evaluate(() => window.__pond!.app.act('preen', 'duck1'));
    const preen = await sample(page, 'duck1', 3.2, 'headYaw');
    expect(Math.max(Math.abs(preen.max), Math.abs(preen.min))).toBeGreaterThan(Math.abs(yaw.max) + 1);
    await page.evaluate(() => window.__pond!.app.act('fly', 'duck1'));
    expect((await sample(page, 'duck1', 7.6, 'y')).max).toBeGreaterThan(2);
    expect((await frame(page, 'duck1'))!.y).toBe(0);
    // ducklings: duplicating a duck makes one that follows it
    await page.evaluate(() => window.__pond!.app.act('ducklings', 'duck1'));
    const ling = (await creatures(page)).at(-1)!;
    expect(ling.parent).toBe('duck1');
  });

  test('lily and frog actions: bloom, drift, invite a frog, hop, catch a fly, croak', async ({ page }) => {
    await openPond(page, 'showcase');
    await page.evaluate(() => window.__pond!.app.act('bloom', 'pad3'));
    expect((await creatures(page)).find((c) => c.id === 'pad3')!.flower).toBe('open');
    expect((await sample(page, 'pad3', 2.5, 'open')).max).toBeGreaterThan(0.95);
    const pad2 = (await frame(page, 'pad2'))!;
    await page.evaluate(() => window.__pond!.app.act('drift', 'pad2'));
    await sample(page, 'pad2', 9.5, 'x');
    const moved = (await frame(page, 'pad2'))!;
    expect(Math.hypot(moved.x - pad2.x, moved.z - pad2.z)).toBeGreaterThan(0.8);
    await page.evaluate(() => window.__pond!.app.act('invite', 'pad3'));
    await sample(page, 'frog2', 1.6, 'y');
    expect((await creatures(page)).filter((c) => c.perch === 'pad3')).toHaveLength(1);
    await page.evaluate(() => window.__pond!.app.act('catch', 'frog1'));
    expect((await sample(page, 'frog1', 2.8, 'tongue')).max).toBeGreaterThan(0.8);
    await page.evaluate(() => window.__pond!.app.act('croak', 'frog1'));
    expect((await sample(page, 'frog1', 2.3, 'croak')).max).toBeGreaterThan(0.8);
    const f1 = (await frame(page, 'frog1'))!;
    await page.evaluate(() => window.__pond!.app.act('hop', 'frog1'));
    expect((await sample(page, 'frog1', 1.3, 'y')).max).toBeGreaterThan(f1.y + 0.3);
    const f1b = (await frame(page, 'frog1'))!;
    expect(Math.hypot(f1b.x - f1.x, f1b.z - f1.z)).toBeGreaterThan(0.8);
  });

  test('select and drag to the far side: the creature gets smaller', async ({ page }) => {
    await openPond(page, 'showcase');
    await page.getByRole('button', { name: 'Move' }).click();
    await page.evaluate(() => {
      const p = window.__pond!;
      p.engine.stop();
      p.engine.pond.dragTo('pad1', 2.6, 4.0);
      p.engine.tick(1 / 60);
    });
    const near = await toScreen(page, 2.6, 0.05, 4.0);
    const boxNear = await screenBox(page, 'pad1');
    await page.mouse.move(near.x, near.y);
    await page.mouse.down();
    const far = await toScreen(page, 1.5, 0, -5);
    await page.mouse.move(far.x, far.y, { steps: 12 });
    await page.mouse.up();
    await page.evaluate(() => window.__pond!.engine.tick(1 / 60));
    const rec = (await creatures(page)).find((c) => c.id === 'pad1')!;
    expect(rec.z).toBeLessThan(-3);
    const boxFar = await screenBox(page, 'pad1');
    expect(boxFar.w).toBeLessThan(boxNear.w * 0.9);
    await expect(page.locator('.select-label')).toContainText('m away');
  });

  test('feeding draws fish to the crumbs', async ({ page }) => {
    await openPond(page, 'showcase');
    const koi = (await frame(page, 'koi1'))!;
    await page.getByRole('button', { name: 'Feed' }).click();
    const spot = await toScreen(page, koi.x + 2.5, 0, koi.z + 0.5);
    await page.mouse.click(spot.x, spot.y);
    expect(await state(page, 'koi1')).toBe('feed');
    const crumbs = await page.evaluate(() => window.__pond!.engine.life.crumbs().length);
    expect(crumbs).toBeGreaterThan(3);
    await sample(page, 'koi1', 4, 'x');
    const after = (await frame(page, 'koi1'))!;
    expect(Math.hypot(after.x - koi.x - 2.5, after.z - koi.z - 0.5)).toBeLessThan(Math.hypot(2.5, 0.5));
  });

  test('rain spreads rings and the frogs look up; a breeze leans the reeds', async ({ page }) => {
    await openPond(page, 'showcase');
    await page.getByRole('button', { name: 'Rain' }).click();
    expect((await sample(page, 'frog2', 1.5, 'lookUp')).max).toBeGreaterThan(0.5);
    const rings = await page.evaluate(() => window.__pond!.engine.world.uRipples.value.filter((r) => r.w > 0 && window.__pond!.engine.world.uTime.value - r.z < 2).length);
    expect(rings).toBeGreaterThan(5);
    await page.getByRole('button', { name: 'Breeze' }).click();
    await sample(page, 'pad1', 3, 'spin');
    expect(await page.evaluate(() => window.__pond!.engine.world.uBreeze.value)).toBeGreaterThan(0.5);
  });

  test('undo, redo, clear and reload persistence', async ({ page }) => {
    await openPond(page);
    const c = await toScreen(page, centre.x, 0, centre.z);
    await drawStroke(page, strokes.fish(c.x, c.y));
    await drawStroke(page, strokes.lily(c.x + 200, c.y + 60));
    expect(await creatures(page)).toHaveLength(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await creatures(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Redo' }).click();
    expect(await creatures(page)).toHaveLength(2);
    await page.waitForTimeout(500);
    await page.goto('/');
    await page.waitForFunction(() => window.__pond && !window.__pond.store.get().loading);
    expect((await creatures(page)).map((c) => c.kind)).toEqual(['fish', 'lily']);
    await page.getByRole('button', { name: 'Pond menu' }).click();
    await page.getByRole('button', { name: 'Clear the pond' }).click();
    expect(await creatures(page)).toHaveLength(0);
    await page.keyboard.press('Meta+z');
    expect(await creatures(page)).toHaveLength(2);
  });

  test('saving an image downloads a real PNG', async ({ page }) => {
    await openPond(page, 'showcase');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save image' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^pond-.*\.png$/);
    const stream = await download.createReadStream();
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk as Uint8Array);
    const bytes = chunks.reduce((n, c) => n + c.length, 0);
    expect(String.fromCharCode(...chunks[0].subarray(1, 4))).toBe('PNG');
    expect(bytes).toBeGreaterThan(200_000);
  });

  test('keyboard: tab selects, number keys act, delete removes, escape deselects, H hides', async ({ page }) => {
    await openPond(page, 'showcase');
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => window.__pond!.store.get().selectedId);
    expect(first).toBeTruthy();
    await expect(page.locator('.creature-bar')).toBeVisible();
    // select the first koi and press 3: leap
    await page.evaluate(() => window.__pond!.store.set({ selectedId: 'koi1' }));
    await page.keyboard.press('3');
    expect(await state(page, 'koi1')).toBe('leap');
    await page.keyboard.press('Delete');
    expect((await creatures(page)).some((c) => c.id === 'koi1')).toBe(false);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__pond!.store.get().selectedId)).toBeNull();
    await page.keyboard.press('h');
    await expect(page.locator('.stage')).toHaveClass(/ui-hidden/);
  });

  test('stress: 15 creatures and a flurry of actions without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openPond(page, 'showcase');
    await page.evaluate(() => {
      const p = window.__pond!;
      for (const id of ['koi1', 'duck1', 'frog2']) p.app.duplicate(id);
    });
    expect(await creatures(page)).toHaveLength(15);
    const ok = await page.evaluate(() => {
      const p = window.__pond!;
      const acts = ['leap', 'hide', 'school', 'dabble', 'preen', 'fly', 'bloom', 'drift', 'invite', 'hop', 'catch', 'croak'];
      p.engine.stop();
      for (let i = 0; i < 900; i++) {
        if (i % 7 === 0) {
          for (const c of p.store.doc.creatures) p.app.act(acts[(i + c.seed) % acts.length], c.id);
        }
        if (i % 50 === 0) p.engine.pond.feed(0.6, -0.3);
        if (i === 100) p.engine.pond.rain(4);
        p.engine.tick(1 / 60);
      }
      p.engine.start();
      return p.engine.pond.ids().every((id) => {
        const f = p.engine.pond.frameOf(id)!;
        return [f.x, f.y, f.z, f.heading, ...Object.values(f.pose)].every(Number.isFinite);
      });
    });
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('mobile portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('layout fits and touch drawing creates a creature', async ({ page }) => {
    await openPond(page);
    for (const sel of ['.toolbar', '.picker']) {
      const bar = await page.locator(sel).boundingBox();
      expect(bar).not.toBeNull();
      expect(bar!.x).toBeGreaterThanOrEqual(0);
      expect(bar!.x + bar!.width).toBeLessThanOrEqual(390);
    }
    const c = await toScreen(page, 0.6, 0, -0.3);
    await page.evaluate(({ cx, cy }) => {
      const canvas = document.querySelector('canvas')!;
      const fire = (type: string, x: number, y: number) =>
        canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: 1 }));
      const pts: [number, number][] = [];
      for (let i = 0; i <= 50; i++) {
        const t = (i / 50) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * 40, cy + Math.sin(t) * 38]);
      }
      fire('pointerdown', ...pts[0]);
      for (const p of pts.slice(1)) fire('pointermove', ...p);
      fire('pointerup', ...pts[pts.length - 1]);
    }, { cx: c.x, cy: c.y });
    const list = await creatures(page);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('lily');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('calms the wind and paints creatures in faster', async ({ page }) => {
    await openPond(page);
    expect(await page.evaluate(() => window.__pond!.engine.world.uWind.value)).toBeLessThan(0.5);
    const c = await toScreen(page, 0.6, 0, -0.3);
    await drawStroke(page, strokes.fish(c.x, c.y));
    const [rec] = await creatures(page);
    await waitFormed(page, rec.id);
  });
});
