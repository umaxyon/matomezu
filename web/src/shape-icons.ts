// 形の小さな絵（viewBox 0 0 24 24。線は currentColor で、塗りは無し）。道具入れ（toolbox.ts）と、形の切り替え（サイドバー・編集ダイアログ）で使う
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
  db: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6V18C5 19.4 8.1 20.5 12 20.5S19 19.4 19 18V6"/>',
};

// 絵を SVG にする（class は大きさと線の太さを決める側で付ける）
export const shapeIcon = (s: Shape, cls: string): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${SHAPE_ICONS[s] ?? ""}</svg>`;
