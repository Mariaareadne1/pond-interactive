import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PondApp } from '../PondApp';
import { useAppState } from '../../state/store';
import { KIND_LABEL } from '../../creatures/types';
import { screenBox } from './SelectionOverlay';

/**
 * After an unsure reading of a drawing: a small chip by the new creature
 * offering the other readings — "Make it a lily pad instead" — for 3 seconds.
 */
export function InsteadChip({ app }: { app: PondApp }) {
  const offer = useAppState(app.store, (s) => s.instead);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offer) return;
    const box3 = new THREE.Box3();
    const update = () => {
      const view = app.pond.get(offer.id)?.view;
      const el = ref.current;
      if (!view || !el) return;
      view.bounds(box3);
      if (box3.isEmpty()) box3.setFromCenterAndSize(view.root.position, new THREE.Vector3(1, 0.4, 1));
      const { minX, minY, maxX } = screenBox(app, box3);
      const x = Math.min(app.rect.width - el.offsetWidth - 12, Math.max(12, (minX + maxX) / 2 - el.offsetWidth / 2));
      el.style.transform = `translate(${x.toFixed(1)}px, ${Math.max(8, minY - el.offsetHeight - 14).toFixed(1)}px)`;
    };
    // follow the creature only while it forms, then hold still so it's easy to tap
    const started = performance.now();
    update();
    const off = app.engine.onBeforeRender(() => {
      if (performance.now() - started < 400) update();
    });
    return () => {
      off();
    };
  }, [app, offer]);

  if (!offer) return null;
  return (
    <div className="instead" ref={ref} key={offer.key} role="group" aria-label="Change what was drawn">
      <span>Make it a</span>
      {offer.kinds.map((k, i) => (
        <span key={k}>
          {i > 0 && <span className="or">or</span>}
          <button className="chip" onClick={() => app.makeInstead(offer.id, k)}>{KIND_LABEL[k].toLowerCase()}</button>
        </span>
      ))}
      <span>instead</span>
    </div>
  );
}
