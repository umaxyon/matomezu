// 形の小さな絵（viewBox 0 0 24 24。線は currentColor で、塗りは無し）。道具入れ（toolbox.ts）と、形を選ぶ絵の並び（shape-picker.ts）で使う。
// ここに無い絵の形（スティックマン・サーバーなど）は、図に描く絵（shape-art.ts）をそのまま線で描く（mz-art-icon。線の太さは使う側の CSS）
import { SHAPE_ART } from "./shape-art";
import { shapeDef } from "./shapes";
import type { Shape } from "./types";

export const SHAPE_ICONS: Partial<Record<Shape, string>> = {
  box: '<rect x="3" y="6" width="18" height="12" rx="2"/>',
  diamond: '<path d="M12 3 21 12 12 21 3 12Z"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  stadium: '<rect x="2.5" y="7" width="19" height="10" rx="5"/>',
  hexagon: '<path d="M7 5H17L21.5 12 17 19H7L2.5 12Z"/>',
  parallelogram: '<path d="M7 6H22L17 18H2Z"/>',
  parallelogramAlt: '<path d="M2 6H17L22 18H7Z"/>',
  trapezoid: '<path d="M7 6H17L21.5 18H2.5Z"/>',
  trapezoidAlt: '<path d="M2.5 6H21.5L17 18H7Z"/>',
  class: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 8.5H20M4 14.5H20"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6V18C5 19.4 8.1 20.5 12 20.5S19 19.4 19 18V6"/>',
};

// 絵を SVG にする（class は大きさと線の太さを決める側で付ける）
export function shapeIcon(s: Shape, cls: string): string {
  const own = SHAPE_ICONS[s];
  const art = shapeDef(s).art;
  if (own != null || !art) return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${own ?? ""}</svg>`;
  return `<svg class="${cls} mz-art-icon" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true">${SHAPE_ART[s] ?? ""}</svg>`;
}
