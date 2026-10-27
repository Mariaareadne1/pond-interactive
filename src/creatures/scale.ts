import { BODY_LENGTH, DUCKLING_SCALE, MINNOW_SCALE } from './types';
import { FISH_LOCAL_LENGTH } from './views/FishView';
import { DUCK_LOCAL_LENGTH } from './views/DuckView';
import { FROG_LOCAL_LENGTH } from './views/FrogView';
import { LILY_LOCAL_LENGTH } from './views/LilyView';
import type { CreatureRecord } from '../state/document';

const LOCAL_LENGTH = { fish: FISH_LOCAL_LENGTH, duck: DUCK_LOCAL_LENGTH, frog: FROG_LOCAL_LENGTH, lily: LILY_LOCAL_LENGTH };

/** World metres per local unit for a creature: its kind's length × drawn size × minnow/duckling. */
export function rootScale(r: Pick<CreatureRecord, 'kind' | 'size' | 'minnow' | 'parent'>): number {
  let k = BODY_LENGTH[r.kind] / LOCAL_LENGTH[r.kind];
  if (r.kind === 'fish' && r.minnow) k *= MINNOW_SCALE;
  if (r.kind === 'duck' && r.parent) k *= DUCKLING_SCALE;
  return k * r.size;
}

/** Length in world metres (nose to tail, or across a pad). */
export function worldLength(r: Pick<CreatureRecord, 'kind' | 'size' | 'minnow' | 'parent'>): number {
  return rootScale(r) * LOCAL_LENGTH[r.kind];
}
