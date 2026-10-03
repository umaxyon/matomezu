// ボックスと線の内部の形と、ボックスの設定を読む関数。DOM の操作はしない

import { truncate } from "./dom";
import type { Arrangement, Arrow, Axis, BoxData, Dash, Route, ChildView, EdgeData, Overflow, Shape, Size, TreeDirection, WorldData } from "./types";
import { ARROWS, SIZES, isRoute, isShape, isSize, isTreeDirection, isView } from "./validate";

const isArrow = (v: unknown): v is Arrow => (ARROWS as readonly unknown[]).includes(v);

// n.x, n.y, n.w, n.h は枠（子孫を含めた範囲）、n.hx, n.hy, n.hw, n.hh は枠内の本体（ヘッド）の位置と大きさ
export interface Box {
  isWorld: false;
  src: BoxData;
  id: string;
  parent: Box | null;
  children: Box[];
  specW: number;
  specH: number;
  x: number; y: number; w: number; h: number;
  hx: number; hy: number; hw: number; hh: number;
  hasPos: boolean;
  // 本来いたい高さ（ほかの箱に押し下げられていなければいる高さ。保存しない）。データの位置、ドラッグで置いた位置、
  // 自分の設定を変えたときに保った位置など、意図して置かれたときに決まり、押し下げられても変わらない。
  // 今の高さ（y）がこれより下なら、上が空いたときに今の x のままここへ向かって上がる
  intendedY: number;
  // 本来いたい横の中心（最上位だけ。線がつながる範囲の中心、ワールドでの位置。NaN はまだ決まっていない。保存しない）。
  // データから置いたとき、ドラッグで置いたとき、はみ出しの調整で移したときに決まる。大きさが変わるときはこれを保つので、
  // 端で押し戻されたり大きい隣にぶつかってずれたりした分は、縮めば元に戻る
  intendedCX: number;
  // 同じ段の兄弟にはみ出さないための、文字の幅の上限（0 なら無し）。配置を決め直すたびに計算し直す（保存しない）
  capW: number;
  el: HTMLDivElement;
  head: HTMLDivElement;
  textEl: HTMLDivElement;
  moreEl: HTMLSpanElement;
  shapeSvg: SVGSVGElement; // スティックマンや DB の絵
  treeSvg: SVGSVGElement;
  treePath: SVGPathElement;
  treeFrame: SVGRectElement; // ツリーで見せているときに全体を囲む枠
}

// ワールドは親の無いボックスたちの入れ物。ノードと同じように扱える形にしておく
export interface World {
  isWorld: true;
  id: null;
  el: HTMLDivElement;
  x: number; y: number; w: number; h: number;
  src: WorldData;
  readonly children: Box[];
}

export type Container = Box | World;

export interface Edge {
  src: EdgeData;
  id: string;
  a: Box;
  b: Box;
  el: SVGGElement;
  lines: SVGPolylineElement[]; // [見える線, クリックを受ける透明な線]
  arrowEl: SVGPathElement; // 矢印の三角（始点・終点の両方を 1 つの path に描く）
  points: [number, number][]; // 線の点の並び（ワールドの座標。折れ点を含む。矢印の分は縮めていない）
  bendEl: SVGLineElement;     // Z 字の中棒をつかむ透明な線（Z 字のときだけ出す）
  // Z 字の中棒が動ける範囲。axis の向きの座標で、from が始点の箱の辺、to が終点の箱の辺（Z 字でなければ null）
  span: { axis: "x" | "y"; from: number; to: number } | null;
  arrangement: Arrangement;   // 2 つの箱の並び（描いたときのもの）
}

// 値が既定（isDefault）なら項目ごと消し、そうでなければ書く（既定値は JSON に残さない）
// Z 字の中棒を、向き合う辺から最低これだけ離す（矢印の長さ + 余白。描くときもドラッグでも使う）
export const BEND_MARGIN = 12;

export const arrowOf = (e: Edge): Arrow | null => (isArrow(e.src.arrow) ? e.src.arrow : null);
const axis = (v: unknown): Axis | null => (v === "horizontal" || v === "vertical" ? v : null);
// 折れ線の始点から出る向き・終点に入る向きの指定（null は自動）
export const exitOf = (e: Edge): Axis | null => axis(e.src.exit);
export const enterOf = (e: Edge): Axis | null => axis(e.src.enter);
export const dashOf = (e: Edge): Dash => (e.src.dash === "dashed" ? "dashed" : "solid");
// 図（ワールド）の線の通り方の既定と、線の実際の通り方（線に無ければ図の既定）
export const routeDefaultOf = (w: World): Route => (isRoute(w.src.route) ? (w.src.route as Route) : "straight");
export const routeOf = (e: Edge, w: World): Route => (isRoute(e.src.route) ? (e.src.route as Route) : routeDefaultOf(w));

export function setOrDelete<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined, isDefault: boolean) {
  if (isDefault || value === undefined) delete obj[key];
  else obj[key] = value;
}

// ---- ボックスの関係 ----

export const captionOf = (n: Box) => (n.src.caption != null ? String(n.src.caption) : String(n.src.id));

export function ancestors(n: Box): Box[] {
  const out: Box[] = [];
  for (let p = n.parent; p; p = p.parent) out.push(p);
  return out;
}

export function descendants(n: Box): Box[] {
  return n.children.flatMap(c => [c, ...descendants(c)]);
}

export function absPos(n: Box): [number, number] {
  let x = 0, y = 0;
  for (let m: Box | null = n; m; m = m.parent) { x += m.x; y += m.y; }
  return [x, y];
}

export const other = (e: Edge, n: Box) => (e.a === n ? e.b : e.a);

// 大きさの指定（width, height）を付ける。0 なら外す（中身に合わせた大きさに戻る）
export function setSpec(n: Box, dim: "w" | "h", value: number) {
  if (dim === "w") {
    n.specW = value;
    if (value) n.src.width = value; else delete n.src.width;
  } else {
    n.specH = value;
    if (value) n.src.height = value; else delete n.src.height;
  }
}

// ---- 設定値 ----

export const sizeOf = (n: Box): Size => (isSize(n.src.size) ? n.src.size : "M");
export const viewOf = (n: Box): ChildView => (isView(n.src.childView) ? n.src.childView : "nest");
export const treeDirOf = (n: Box): TreeDirection => (isTreeDirection(n.src.treeDirection) ? n.src.treeDirection : "down");
// 内包しているボックス（子を持ち、見せ方が内包）
export const isNesting = (n: Box) => n.children.length > 0 && viewOf(n) === "nest";
// 親の中に入っている（ドラッグで自由に動かせる）子か。最上位も含む
export const inNest = (n: Box) => !n.parent || viewOf(n.parent) === "nest";
// 非表示の親の下にいるか
export const isHidden = (n: Box) => ancestors(n).some(p => viewOf(p) === "hidden");
// ツリーで並んでいる子か（子同士の線は描かない）
export const inTree = (n: Box) => !!n.parent && viewOf(n.parent) === "tree";
// 子を内包しているボックスは枠なので、形は常にボックス
// ページの箱は、決まった形（タブ付きの見出し。render.ts）で描くので、形の指定は使わない
export const shapeOf = (n: Box): Shape => (!isNesting(n) && n.src.page !== true && isShape(n.src.shape) ? n.src.shape : "box");
// ページの箱（中身は別のページ。docs/TABS-plan.md）。最初のページでは子を持たない箱として描く
export const isPageBox = (n: Box) => n.src.page === true && !n.children.length;
export const fillOf = (n: Box) => n.src.fill !== false;
export const borderOf = (n: Box) => (n.src.border != null ? !!n.src.border : isNesting(n));
export function overflowOf(c: Container): Overflow {
  if (c.isWorld) return c.src.overflow === "clip" ? "clip" : "wrap";
  // 文字のボックスは伸ばさない（伸ばすと折り返しに戻せなくなる）。grow はグループになったときに使う
  if (!c.children.length) return c.src.overflow === "clip" ? "clip" : "wrap";
  return c.src.overflow || "grow";
}
export const displayCaption = (n: Box) => truncate(captionOf(n), SIZES[sizeOf(n)].limit);

// t が n 自身か、n の子孫か
export function isInside(t: Box, n: Box) {
  for (let m: Box | null = t; m; m = m.parent) if (m === n) return true;
  return false;
}
