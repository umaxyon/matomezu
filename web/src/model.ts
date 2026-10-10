// ボックスと線の内部の形と、ボックスの設定を読む関数。DOM の操作はしない

import { truncate } from "./dom";
import type { Arrangement, Arrow, BoxData, Dash, Route, ChildView, EdgeData, Overflow, Shape, Size, TreeDirection, WorldData } from "./types";
import type { EndMemory, EndPaths, Route as Routed, RouteShape, Segment } from "./routing";
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
  // リストの子のときの幅（親のリストがそろえた幅。node-kinds.ts の list が決める。保存しない）
  listW: number;
  // 内包する箱・リストの親の、見出しの下に置いた本文の高さ（0 なら本文なし）。子を置ける領域の上端を決める（node-kinds.ts。保存しない）
  bodyH: number;
  el: HTMLDivElement;
  head: HTMLDivElement;
  textEl: HTMLDivElement;
  bodyEl: HTMLDivElement; // 本文（docs/BODY-plan.md。本文が無ければ隠す）
  gripEl: HTMLDivElement; // 本文の幅を変えるつまみ（本文の右の縁。選んでいるときだけ CSS で出す）
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
  handlesEl: SVGGElement;     // 途中の区間をつかむ透明な線（区間ごとに 1 本。render.ts が作る）
  shape: RouteShape | null;   // 折れ線の形（描いたときのもの。直線などは null）
  segments: Segment[];        // ドラッグで動かせる途中の区間（描いたときのもの）
  arrangement: Arrangement;   // 2 つの箱の並び（描いたときのもの）
  ends: EndPaths | null;      // 線の端をつまんで動かせる道（描いたときのもの。重なった箱どうしなど、動かせなければ null）
  memory: EndMemory | null;   // 自由な端を前に描いた辺と位置（次に描くときに保つ。入れ替えなどで捨てる。docs/EDGE-SPEC.md）
  // 前に道筋を決めたときの入力（JSON）と結果。入力が同じなら使い回す（ドラッグ中に、動いていない線の避ける道を探し直さない）。
  // データを書き換える結果（fix のあるもの）は覚えない
  routeMemo: { key: string; route: Routed } | null;
  endsEl: SVGGElement;        // 線の両端をつかむ丸（線を選んでいるときだけ出す）
  labelEl: SVGForeignObjectElement | null; // キャプションの札（キャプションがあるときだけ。render.ts が作る）
}

// 値が既定（isDefault）なら項目ごと消し、そうでなければ書く（既定値は JSON に残さない）
// Z 字の中棒を、向き合う辺から最低これだけ離す（矢印の長さ + 余白。描くときもドラッグでも使う）
export const BEND_MARGIN = 12;

export const arrowOf = (e: Edge): Arrow | null => (isArrow(e.src.arrow) ? e.src.arrow : null);
// 手で直した折れ線の途中の区間の位置（無ければ null。docs/ROUTE-plan.md）
export const viaOf = (e: Edge): number[] | null =>
  Array.isArray(e.src.via) && e.src.via.every(v => typeof v === "number" && Number.isFinite(v)) ? [...e.src.via] : null;
export const dashOf = (e: Edge): Dash => (e.src.dash === "dashed" ? "dashed" : "solid");
// 図（ワールド）の線の通り方の既定と、線の実際の通り方（線に無ければ図の既定）
export const routeDefaultOf = (w: World): Route => (isRoute(w.src.route) ? (w.src.route as Route) : "straight");
export const routeOf = (e: Edge, w: World): Route => (isRoute(e.src.route) ? (e.src.route as Route) : routeDefaultOf(w));

export function setOrDelete<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined, isDefault: boolean) {
  if (isDefault || value === undefined) delete obj[key];
  else obj[key] = value;
}

// ---- ボックスの関係 ----

// キャプション（無ければ空。空の箱も作れる。2026-10-10 ユーザー。以前は id を出していた）
export const captionOf = (n: Box) => (n.src.caption != null ? String(n.src.caption) : "");

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

// リストの子か（docs/LIST-plan.md）。リストの子では形を使わない（データは書き換えず、見せるときだけ無視する。リストから出すと元に戻る）。
// サイズは見た目だけリストの中でそろえ（listSizeOf）、子の見せ方は自分の設定に従う（docs/SIZE-plan.md）
export const inList = (n: Box): boolean => !!n.parent && viewOf(n.parent) === "list";
// データのサイズ（無ければ M）
export const dataSizeOf = (n: Box): Size => (isSize(n.src.size) ? n.src.size : "M");
// 見た目が葉の箱か（子が無いか、子を隠して本体だけを見せる）
const leafLike = (n: Box) => !n.children.length || viewOf(n) === "hidden";
const SIZE_RANK: Record<Size, number> = { S: 0, M: 1, L: 2 };
// リストの葉の子の見た目のサイズ: 葉の子のうち一番大きいサイズ（S, M, M なら M。S だけなら S）
export function listSizeOf(list: Box): Size {
  const sizes = list.children.filter(leafLike).map(dataSizeOf);
  return sizes.length ? sizes.reduce((a, b) => (SIZE_RANK[b] > SIZE_RANK[a] ? b : a)) : "M";
}
// サイズ（L / M / S）が効くのは、見た目が葉の箱だけ（子の無い箱、ツリーの親の本体、非表示）。内包・リストの箱の大きさは子の並びで決まるので、
// サイズを使わない（データは消さずに無視する。子を全部外せば効く）。リストの葉の子は、リストの中で一番大きいサイズの見た目にそろえる（docs/SIZE-plan.md）
export const sizeOf = (n: Box): Size =>
  (inList(n) && leafLike(n) ? listSizeOf(n.parent!) : isNesting(n) ? "M" : dataSizeOf(n));
export const viewOf = (n: Box): ChildView => (isView(n.src.childView) ? n.src.childView : "nest");
export const treeDirOf = (n: Box): TreeDirection => (isTreeDirection(n.src.treeDirection) ? n.src.treeDirection : "down");
// 子を枠の中に入れて見せるボックス（子を持ち、見せ方が内包かリスト）。枠と見出しで描き、形は使わない
export const isNesting = (n: Box) => n.children.length > 0 && (viewOf(n) === "nest" || viewOf(n) === "list");
// 親の中に入っている（ドラッグで自由に動かせる）子か。最上位も含む
export const inNest = (n: Box) => !n.parent || viewOf(n.parent) === "nest";
// 非表示の親の下にいるか
export const isHidden = (n: Box) => ancestors(n).some(p => viewOf(p) === "hidden");
// ツリーで並んでいる子か（子同士の線は描かない）
export const inTree = (n: Box) => !!n.parent && viewOf(n.parent) === "tree";
// 子を内包しているボックスは枠なので、形は常にボックス
// ページの箱は、決まった形（タブ付きの見出し。render.ts）で描くので、形の指定は使わない
export const shapeOf = (n: Box): Shape =>
  (!isNesting(n) && !inList(n) && n.src.page !== true && isShape(n.src.shape) ? n.src.shape : "box");
// ページの箱（中身は別のページ。docs/TABS-plan.md）。最初のページでは子を持たない箱として描く
export const isPageBox = (n: Box) => n.src.page === true && !n.children.length;
export const fillOf = (n: Box) => n.src.fill !== false;
export const borderOf = (n: Box) => (n.src.border != null ? !!n.src.border : isNesting(n));
export function overflowOf(c: Container): Overflow {
  // ワールドの大きさは表示領域と箱の範囲で決まり、はみ出すものがほとんど無いので、中身の扱いを使わない（データの overflow は無視する。2026-10-11）
  if (c.isWorld) return "wrap";
  // 文字のボックスは伸ばさない（伸ばすと折り返しに戻せなくなる）。子を持つ箱はつねに子に合わせて伸ばす（データの overflow は無視する。
  // 図が幅を決め、文字は図の都合で折り返す。docs/SIZE-plan.md）
  if (!c.children.length) return c.src.overflow === "clip" ? "clip" : "wrap";
  return "grow";
}
// S は 10 文字で切る。リストの子は高さを中身に合わせるので切らない
export const displayCaption = (n: Box) => (inList(n) ? captionOf(n) : truncate(captionOf(n), SIZES[sizeOf(n)].limit));
// 出す本文（無ければ空）。本文を持てるのは普通の箱で、S サイズ（高さが固定）以外（docs/BODY-plan.md）
export const canBody = (n: Box): boolean =>
  shapeOf(n) === "box" && sizeOf(n) !== "S" && n.src.page !== true && overflowOf(n) !== "clip";
export const bodyOf = (n: Box): string => (typeof n.src.body === "string" && n.src.body && canBody(n) ? n.src.body : "");
// 本文の最大行数（無ければ 0。制限なし）
export const bodyLinesOf = (n: Box): number => (Number.isInteger(n.src.bodyLines) && (n.src.bodyLines as number) > 0 ? n.src.bodyLines as number : 0);
// 本文の幅の指定（無ければ 0）
export const bodyWidthOf = (n: Box): number => (typeof n.src.bodyWidth === "number" && n.src.bodyWidth > 0 ? n.src.bodyWidth : 0);
// 内包する箱・リストの親の本文を折り返す幅（箱の幅として数える。余白を含む）。自動なら箱の幅いっぱい、つまみで変えていればその幅。
// 箱の幅は子の並びで決まり、本文はそれを超えない（図が優先。子を詰めて狭くなれば箱の幅で折り返し、覚えた幅は消さない）
export const bodyWrapW = (n: Box, w: number): number => Math.min(bodyWidthOf(n) || w, w);

// t が n 自身か、n の子孫か
export function isInside(t: Box, n: Box) {
  for (let m: Box | null = t; m; m = m.parent) if (m === n) return true;
  return false;
}
