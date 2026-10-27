/** The four kinds of things that can be drawn into the pond. */
export type Kind = 'fish' | 'duck' | 'lily' | 'frog';
export const KINDS: readonly Kind[] = ['fish', 'duck', 'lily', 'frog'];

export const KIND_LABEL: Record<Kind, string> = { fish: 'Fish', duck: 'Duck', lily: 'Lily pad', frog: 'Frog' };

/** Where a creature lives. Fish and lily pads need water; frogs need a bank or a pad; ducks take either. */
export type Habitat = 'water' | 'land' | 'either';
export const HABITAT: Record<Kind, Habitat> = { fish: 'water', duck: 'either', lily: 'water', frog: 'land' };

export type FlowerState = 'none' | 'bud' | 'open';

/**
 * The tile is a miniature; creatures are drawn larger than life so they read
 * as characters (MEADOW's sheep are 2.1×). Lengths below are world metres at
 * size 1, nose to tail (or across, for a pad).
 */
export const BODY_LENGTH: Record<Kind, number> = { fish: 2.0, duck: 1.95, lily: 2.1, frog: 1.35 };
/** Minnows are small, quick, silver fish; koi are the big painted ones. */
export const MINNOW_SCALE = 0.62;
/** A duckling is a smaller, paler duck that follows its parent. */
export const DUCKLING_SCALE = 0.56;
