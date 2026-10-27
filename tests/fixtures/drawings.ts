import type { Pt } from '../../src/interaction/stroke';

/** Hand-made doodles (screen px, y down), wobbled a little like a real hand. */

const wobble = (i: number, amp: number) => Math.sin(i * 1.7) * amp + Math.sin(i * 0.53 + 1) * amp * 0.6;

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 70, amp = 1.5): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * (rx + wobble(i, amp));
    const y = Math.sin(t) * (ry + wobble(i + 3, amp));
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return pts;
}

/** A fish: long body with a forked tail at the left end, head to the right. */
export function fish(cx: number, cy: number, s = 1, faceLeft = false): Pt[] {
  const pts: Pt[] = [];
  const add = (x: number, y: number) => pts.push({ x: cx + (faceLeft ? -x : x) * s, y: cy + y * s });
  // top edge, nose to tail
  for (let i = 0; i <= 20; i++) { const u = i / 20; add(70 - u * 120, -22 * Math.sin(Math.PI * (0.15 + u * 0.85)) - 2); }
  // tail: up-fork, notch, down-fork
  add(-62, -26); add(-78, -30); add(-66, -8); add(-58, 0); add(-66, 8); add(-80, 30); add(-62, 24);
  // bottom edge, tail to nose
  for (let i = 0; i <= 20; i++) { const u = i / 20; add(-50 + u * 120, 20 * Math.sin(Math.PI * (1 - u * 0.85))); }
  add(70, 0);
  return pts;
}

/** A duck: a low oval body with a round head on top at the right end. */
export function duck(cx: number, cy: number, s = 1, faceLeft = false): Pt[] {
  const pts: Pt[] = [];
  const add = (x: number, y: number) => pts.push({ x: cx + (faceLeft ? -x : x) * s, y: cy + y * s });
  // bottom of the body, left to right
  for (let i = 0; i <= 16; i++) { const u = i / 16; add(-60 + u * 110, 18 + 8 * Math.sin(Math.PI * u)); }
  // up the chest into the head
  add(56, 6); add(52, -10);
  for (let i = 0; i <= 14; i++) { const a = -0.2 + (i / 14) * Math.PI * 1.3; add(36 + Math.cos(a) * 20, -30 - Math.sin(a) * 20); }
  // back along the top of the body to a perky tail
  for (let i = 0; i <= 12; i++) { const u = i / 12; add(16 - u * 72, -10 + 4 * Math.sin(Math.PI * u)); }
  add(-66, -18); add(-64, 4);
  return pts;
}

export const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r * 0.96, 0.3);
