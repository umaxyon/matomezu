// 画面の見え方（D32）: 図の枠のスクロールの位置と、ワールドの座標の行き来。
// ワールドは図の枠の中で ox・oy だけずらして置き（周りの余白か、紙が表示領域より小さければ真ん中に来る量。layout.ts の sizeCanvas）、
// 倍率（zoom）は transform: scale でかける（graph-view.ts）。なので、スクロールの位置 = ずらす量 + ワールドの座標 × 倍率。
// この行き来はここだけに書く（preview.ts・minimap.ts・graph.ts・graph-view.ts・interaction.ts・ask-bubbles.ts・point-frame.ts・unseen.ts が使う）
//
//   const v = graph.view();                 // { zoom, margin, ox, oy }
//   visibleWorld(stage, v);                 // 見えている範囲（ワールドの座標）
//   scrollWorldTo(stage, v, x, y);          // ワールドの (x, y) が見えている範囲の左上に来るようにスクロールする
//   const a = anchorAt(stage, v, at);       // at（画面の座標。無ければ見えている範囲の真ん中）の下のワールドの点を覚え、
//   keepAnchor(stage, nextView, a);         // 倍率を変えたあと、その点が同じ所に来るようにスクロールする
//   homeScroll(stage, v, w, h);             // ワールドの左上を表示領域の左上に（紙が小さければ真ん中に）
//   clientToIn(el, zoom, cx, cy);           // 画面の点を、ワールドか箱の要素 el の中の座標に
//   inToClient(el, zoom, x, y);             // その逆
//   clientRectToIn(el, zoom, r);            // 画面の矩形（getBoundingClientRect の形）を、el の中の矩形（ワールドの単位）に
//   inRectToClient(el, zoom, r);            // その逆
//   viewRectOf(stage);                      // 図の枠の見えている範囲（画面の座標。枠線とスクロールバーを除く）
//   scrollToCenter(stage, r, behavior);     // 画面の矩形 r の真ん中が、見えている範囲の真ん中に来るようにスクロールする
//   toWorldLength(zoom, px);                // 画面の上の長さを、ワールドの長さに

import type { Rect } from "./geom";

export interface View {
  zoom: number;   // ワールドにかけている倍率
  margin: number; // 図の周りの余白（px。倍率をかけない）
  ox: number;     // ワールドを図の枠の中でずらしている量（横・縦。px。余白か、紙が小さければ真ん中に来る量）
  oy: number;
}
type Axis = "x" | "y";
const offset = (v: View, axis: Axis) => (axis === "x" ? v.ox : v.oy);

// スクロールの位置（px）とワールドの座標
export const toScroll = (v: View, world: number, axis: Axis = "x"): number => offset(v, axis) + world * v.zoom;
export const fromScroll = (v: View, scroll: number, axis: Axis = "x"): number => (scroll - offset(v, axis)) / v.zoom;

// 見えている範囲（ワールドの座標）
export function visibleWorld(stage: HTMLElement, v: View): Rect {
  return {
    x: fromScroll(v, stage.scrollLeft, "x"), y: fromScroll(v, stage.scrollTop, "y"),
    w: stage.clientWidth / v.zoom, h: stage.clientHeight / v.zoom,
  };
}

// ワールドの (x, y) が見えている範囲の左上に来るようにスクロールする（はみ出さないようにブラウザが収める）
export function scrollWorldTo(stage: HTMLElement, v: View, x: number, y: number): void {
  stage.scrollTo({ left: toScroll(v, x, "x"), top: toScroll(v, y, "y") });
}

// 画面の点 at（無ければ見えている範囲の真ん中）と、その下のワールドの点
export interface Anchor { px: number; py: number; wx: number; wy: number }

export function anchorAt(stage: HTMLElement, v: View, at?: { x: number; y: number }): Anchor {
  const r = viewRectOf(stage);
  const px = at ? at.x - r.left : (r.right - r.left) / 2;
  const py = at ? at.y - r.top : (r.bottom - r.top) / 2;
  return { px, py, wx: fromScroll(v, stage.scrollLeft + px, "x"), wy: fromScroll(v, stage.scrollTop + py, "y") };
}

// 見え方が v になったあと、覚えたワールドの点が、覚えた画面の点に来るようにスクロールする
export function keepAnchor(stage: HTMLElement, v: View, a: Anchor): void {
  stage.scrollLeft = toScroll(v, a.wx, "x") - a.px;
  stage.scrollTop = toScroll(v, a.wy, "y") - a.py;
}

// ワールドの左上を表示領域の左上に合わせる（スクロールの位置 = 余白）。紙（w × h）が表示領域より小さければ真ん中に来るように
// ずらす量（ox・oy）に真ん中の分が入っているので、その分戻す
export function homeScroll(stage: HTMLElement, v: View, w: number, h: number): void {
  stage.scrollLeft = Math.max(0, toScroll(v, 0, "x") - Math.max(0, (stage.clientWidth - w * v.zoom) / 2));
  stage.scrollTop = Math.max(0, toScroll(v, 0, "y") - Math.max(0, (stage.clientHeight - h * v.zoom) / 2));
}

// 画面の上の長さ（px）を、ワールドの座標の長さにする（倍率をかけていれば割り戻す）
export const toWorldLength = (zoom: number, px: number): number => px / zoom;

// 画面の点（clientX・clientY）と、ワールドか箱の要素 el の中の座標（ワールドの単位）の行き来。
// el は倍率のかかった中にあり、getBoundingClientRect は倍率をかけたあとの位置を返す
export function clientToIn(el: Element, zoom: number, cx: number, cy: number): [number, number] {
  const r = el.getBoundingClientRect();
  return [toWorldLength(zoom, cx - r.left), toWorldLength(zoom, cy - r.top)];
}
export function inToClient(el: Element, zoom: number, x: number, y: number): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + x * zoom, r.top + y * zoom];
}

// 画面の矩形（getBoundingClientRect の形）と、ワールドか箱の要素 el の中の矩形（ワールドの単位）の行き来。
// 毎フレーム多くの矩形を変えるときは、el の代わりに el.getBoundingClientRect() を一度だけ測って渡せる
export interface ClientRect { left: number; top: number; right: number; bottom: number }
type Origin = Element | { left: number; top: number };
const originOf = (o: Origin) => ("getBoundingClientRect" in o ? o.getBoundingClientRect() : o);

export function clientRectToIn(el: Origin, zoom: number, r: ClientRect): Rect {
  const o = originOf(el);
  return { x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, w: (r.right - r.left) / zoom, h: (r.bottom - r.top) / zoom };
}
export function inRectToClient(el: Origin, zoom: number, r: Rect): ClientRect {
  const o = originOf(el);
  return { left: o.left + r.x * zoom, top: o.top + r.y * zoom, right: o.left + (r.x + r.w) * zoom, bottom: o.top + (r.y + r.h) * zoom };
}

// 図の枠（スクロールする要素）の見えている範囲（画面の座標）。枠線（clientLeft・clientTop）とスクロールバーを除く。
// 倍率のかかった中にある要素（リストのスクロール）は、その倍率 scale をかけた見た目の大きさで
export function viewRectOf(stage: Element, scale = 1): ClientRect {
  const c = stage.getBoundingClientRect();
  const left = c.left + stage.clientLeft * scale, top = c.top + stage.clientTop * scale;
  return { left, top, right: left + stage.clientWidth * scale, bottom: top + stage.clientHeight * scale };
}

// 画面の矩形 r の真ん中が、図の枠の見えている範囲の真ん中に来るようにスクロールする
export function scrollToCenter(stage: Element, r: ClientRect, behavior?: ScrollBehavior): void {
  const v = viewRectOf(stage);
  stage.scrollBy({ left: (r.left + r.right) / 2 - (v.left + v.right) / 2, top: (r.top + r.bottom) / 2 - (v.top + v.bottom) / 2, behavior });
}
