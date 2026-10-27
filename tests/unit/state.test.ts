import { describe, expect, test } from 'vitest';
import {
  addCreature, defaultDoc, emptyDoc, MAX_CREATURES, parseDoc, removeCreature, showcaseDoc, updateCreature, type CreatureRecord,
} from '../../src/state/document';
import { commit, amend, createHistory, redo, undo, canRedo, canUndo } from '../../src/state/history';
import { isBank, isWater } from '../../src/scene/pondShape';

const fish = (id: string, x = 0, z = 0): CreatureRecord => ({ id, kind: 'fish', x, z, heading: 0, seed: 1, size: 1, pattern: 0 });

describe('the pond document', () => {
  test('edits return new documents and never mutate the old one', () => {
    const a = emptyDoc();
    const b = addCreature(a, fish('f1'));
    const c = updateCreature(b, 'f1', { x: 2 });
    expect(a.creatures).toHaveLength(0);
    expect(b.creatures[0].x).toBe(0);
    expect(c.creatures[0].x).toBe(2);
    expect(Object.isFrozen(a) || a !== b).toBe(true);
  });

  test('removing a pad lets its frog go; removing a duck lets its ducklings go', () => {
    let d = addCreature(emptyDoc(), { id: 'p', kind: 'lily', x: 0, z: 0, heading: 0, seed: 1, size: 1, flower: 'none' });
    d = addCreature(d, { id: 'fr', kind: 'frog', x: 0, z: 0, heading: 0, seed: 2, size: 1, perch: 'p' });
    d = addCreature(d, { id: 'du', kind: 'duck', x: 1, z: 1, heading: 0, seed: 3, size: 1 });
    d = addCreature(d, { id: 'ling', kind: 'duck', x: 1, z: 2, heading: 0, seed: 4, size: 1, parent: 'du' });
    const e = removeCreature(removeCreature(d, 'p'), 'du');
    expect(e.creatures.find((c) => c.id === 'fr')?.perch).toBeUndefined();
    expect(e.creatures.find((c) => c.id === 'ling')?.parent).toBeUndefined();
  });

  test('the default and showcase ponds are valid and place everything where it can live', () => {
    for (const doc of [defaultDoc(), showcaseDoc()]) {
      expect(parseDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
      for (const c of doc.creatures) {
        if (c.kind === 'frog') expect(c.perch ? true : isBank(c.x, c.z), c.id).toBe(true);
        else expect(isWater(c.x, c.z, 0.5), c.id).toBe(true);
      }
    }
  });
});

describe('validating untrusted files', () => {
  test('rejects the wrong shape or version', () => {
    expect(parseDoc(null)).toBeNull();
    expect(parseDoc('pond')).toBeNull();
    expect(parseDoc({ version: 2, creatures: [] })).toBeNull();
    expect(parseDoc({ version: 1 })).toBeNull();
    // a MEADOW scene is not a pond
    expect(parseDoc({ version: 2, sheep: [] })).toBeNull();
  });

  test('drops bad entries, clamps values and moves creatures into bounds', () => {
    const doc = parseDoc({
      version: 1,
      creatures: [
        { id: 'ok', kind: 'fish', x: 0, z: 0, heading: 10, seed: 5, size: 9, pattern: 7 },
        { id: 'bad-kind', kind: 'whale', x: 0, z: 0, heading: 0, seed: 1 },
        { id: 'nan', kind: 'duck', x: NaN, z: 0, heading: 0, seed: 1 },
        { id: 'far', kind: 'duck', x: 900, z: -900, heading: 0, seed: 1 },
        { id: 'frog-in-water', kind: 'frog', x: 0.6, z: -0.3, heading: 0, seed: 1 },
        { id: '<script>', kind: 'lily', x: 3, z: 0, heading: 0, seed: 1, flower: 'weird' },
        'nonsense',
      ],
    })!;
    expect(doc.creatures.map((c) => c.kind)).toEqual(['fish', 'duck', 'frog', 'lily']);
    const f = doc.creatures[0];
    expect(f.size).toBe(1.15);
    expect(f.pattern).toBe(3);
    expect(Math.abs(f.heading)).toBeLessThanOrEqual(Math.PI);
    const duck = doc.creatures[1];
    expect(isWater(duck.x, duck.z, 0.5)).toBe(true);
    const frog = doc.creatures[2];
    expect(isBank(frog.x, frog.z)).toBe(true);
    const lily = doc.creatures[3];
    expect(lily.id).not.toBe('<script>');
    expect(lily.flower).toBe('none');
  });

  test('dangling references are dropped', () => {
    const doc = parseDoc({
      version: 1,
      creatures: [
        { id: 'fr', kind: 'frog', x: -11, z: 8, heading: 0, seed: 1, perch: 'nope' },
        { id: 'ling', kind: 'duck', x: 0, z: 0, heading: 0, seed: 1, parent: 'fr' },
      ],
    })!;
    expect(doc.creatures[0].perch).toBeUndefined();
    expect(doc.creatures[1].parent).toBeUndefined();
  });

  test('caps the number of creatures', () => {
    const many = Array.from({ length: 80 }, (_, i) => fish(`f${i}`));
    expect(parseDoc({ version: 1, creatures: many })!.creatures).toHaveLength(MAX_CREATURES);
  });

  test('duplicate ids are renamed', () => {
    const doc = parseDoc({ version: 1, creatures: [fish('x'), fish('x')] })!;
    expect(new Set(doc.creatures.map((c) => c.id)).size).toBe(2);
  });
});

describe('undo and redo', () => {
  test('one step per commit; amend does not add a step', () => {
    let h = createHistory(emptyDoc());
    h = commit(h, addCreature(h.present, fish('a')));
    h = commit(h, addCreature(h.present, fish('b')));
    h = amend(h, updateCreature(h.present, 'b', { x: 3 }));
    expect(h.past).toHaveLength(2);
    h = undo(h);
    expect(h.present.creatures).toHaveLength(1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.creatures[1].x).toBe(3);
    h = undo(undo(h));
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  test('a new commit clears the redo stack', () => {
    let h = createHistory(emptyDoc());
    h = commit(h, addCreature(h.present, fish('a')));
    h = undo(h);
    h = commit(h, addCreature(h.present, fish('b')));
    expect(canRedo(h)).toBe(false);
  });
});
