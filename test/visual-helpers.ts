export { niceTicks } from 'smaltkit/svg';
import { squarify } from 'smaltkit/charts';

export function squarifyCheck(): boolean {
  const rects = squarify([{ i: 0, v: 6 }, { i: 1, v: 6 }, { i: 2, v: 4 }, { i: 3, v: 3 }, { i: 4, v: 2 }, { i: 5, v: 2 }, { i: 6, v: 1 }], { x: 0, y: 0, w: 600, h: 400 });
  const area = rects.reduce((a, r) => a + r.w * r.h, 0);
  return rects.length === 7 && Math.abs(area - 240000) < 1e-6 && rects.every((r) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6);
}
