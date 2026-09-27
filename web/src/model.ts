// ボックスと線の内部の形と、ボックスの設定を読む関数。DOM の操作はしない

import { truncate } from "./dom";
import type { BoxData, ChildView, EdgeData, Overflow, Shape, Size, TreeDirection, WorldData } from "./types";
import { SIZES, isShape, isSize, isTreeDirection, isView } from "./validate";

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
  placed: boolean;
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
  lines: SVGLineElement[];
}

// 値が既定（isDefault）なら項目ごと消し、そうでなければ書く（既定値は JSON に残さない）
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
export const shapeOf = (n: Box): Shape => (!isNesting(n) && isShape(n.src.shape) ? n.src.shape : "box");
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
