import type { CreatureRecord, PondDoc } from '../../state/document';

/** The contextual actions each creature offers, in bar order (keys 1–4 follow this order). */
export interface CreatureAction {
  id: string;
  label: string;
}

export function actionsFor(rec: CreatureRecord, doc: PondDoc): CreatureAction[] {
  switch (rec.kind) {
    case 'fish': {
      const fish = doc.creatures.filter((c) => c.kind === 'fish').length;
      return [
        { id: 'come', label: 'Come here' },
        { id: 'hide', label: 'Hide' },
        { id: 'leap', label: 'Leap' },
        ...(fish >= 3 ? [{ id: 'school', label: 'School' }] : []),
      ];
    }
    case 'duck':
      return [
        { id: 'dabble', label: 'Dabble' },
        { id: 'preen', label: 'Preen' },
        { id: 'fly', label: 'Fly' },
        { id: 'ducklings', label: rec.parent ? 'Another duckling' : 'Ducklings' },
      ];
    case 'lily':
      return [
        { id: 'bloom', label: rec.flower === 'open' ? 'Close' : 'Bloom' },
        { id: 'drift', label: 'Drift' },
        { id: 'invite', label: 'Invite a frog' },
      ];
    case 'frog':
      return [
        { id: 'hop', label: 'Hop' },
        { id: 'catch', label: 'Catch a fly' },
        { id: 'croak', label: 'Croak' },
      ];
  }
}
