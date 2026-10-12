// ボックスと線の内部の形と、ボックスの設定を読む関数。DOM の操作はしない

import { truncate } from "./dom";
import { DEFAULT_SHAPE, shapeDef } from "./shapes";
import type { Arrangement, Arrow, BoxData, Dash, Route, ChildView, EdgeData, Overflow, Shape, Size, TreeDirection, WorldData } from "./types";
import type { EndMemory, EndPaths, Route as Routed, RouteShape, Segment } from "./routing";
import { ARROWS, SIZES, isRoute, isShape, isSize, isTreeDirection, isView } from "./validate";

const isArrow = (v: unknown): v is Arrow => (ARROWS as readonly unknown[]).includes(v);

// n.x, n.y, n.w, n.h は枠（子孫を含めた範囲）、n.hx, n.hy, n.hw, n.hh は枠内の本体（ヘッド）の位置と大きさ
export interface Box {
  isWorld: false;
  world: World; // 箱が置かれている図（最上位の箱を並べる戦略は、ワールドの子の見せ方）
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
  // 見た目の補正値（テーマとサイズと形から。render.ts の applyStyle が決める。docs/LAYOUT-BASE-plan.md）。まだ決めていなければ null。
  // 足跡（x, y, w, h）はこの分だけ土台より四方に広い。値が変わったら、土台の位置を保つよう x, y をずらす
  out: { x: number; y: number } | null;
  // リストの子のときの幅（親のリストがそろえた幅。node-kinds.ts の list が決める。保存しない）
  listW: number;
  // 内包する箱・リストの親の、見出しの下に置いた本文の高さ（0 なら本文なし）。子を置ける領域の上端を決める（node-kinds.ts。保存しない）
  bodyH: number;
  el: HTMLDivElement;
  head: HTMLDivElement;
  textEl: HTMLDivElement;
  bodyEl: HTMLDivElement; // 本文（docs/BODY-plan.md。本文が無ければ隠す）
  classEl: HTMLDivElement; // クラスの箱の属性と操作の区画（docs/CLASS-plan.md。クラスでなければ隠す）
  gripEl: HTMLDivElement; // 本文の幅を変えるつまみ（本文の右の縁。選んでいるときだけ CSS で出す）
  widthGripEl: HTMLDivElement; // リストの幅を変えるつまみ（リストの右の縁。選んでいるときだけ CSS で出す）
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
  arrowEl: SVGPathElement; // 端の形の塗る部分（始点・終点の両方を 1 つの path に描く。heads.ts）
  headLineEl: SVGPathElement; // 端の形の線で描く部分（白抜き・開いた矢じり・ER 図の印）
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
// 線の通り方の既定（ワールドに route が無いとき）
export const DEFAULT_ROUTE: Route = "elbow";
export const routeDefaultOf = (w: World): Route => (isRoute(w.src.route) ? (w.src.route as Route) : DEFAULT_ROUTE);
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

// ---- 並べ方の戦略（docs/PATTERN-plan.md の 3.6 章と 6 章） ----
// パターンは「子を持つ箱が、子をどう並べるかの戦略」で、子の見せ方（childView）がそのまま戦略の選択になる。
// 戦略ごとの決まりは STRATEGIES の 1 行にまとめ、判定（arrangeOf・placedBy・abilitiesOf など）はここから引く。
// 戦略を足すときは、ここに 1 行と、layout/node-kinds.ts の並べ方（大きさと子の置き方）を足す。
// 破ってはいけない決まりは CLAUDE.md の「並べ方の戦略」
// 非表示（hidden）は「子を描かずに ▼ だけを出す戦略」（折りたたみの項目には分けない。2026-10-11 ユーザー）

export interface Strategy {
  framed: boolean;      // 子を枠の中に入れ、見出しを付けて見せる（内包・リスト）。自分の形とサイズは使わない（大きさは子の並びで決まる）
  free: boolean;        // 子を自由に置く（落とした位置に置き、子をドラッグで動かせる）
  descendants: boolean; // 子だけでなく子孫全体を並べる（子孫の見せ方は無視する）
  reorder: boolean;     // 並べた子を、兄弟の中で並べ替えられる（並べ替えの差し込みもできる）
  link: boolean;        // 並べた子どうしに線を引ける・〇を出す（自動で並べる戦略では、線を引くと形が崩れる）
  widthGrip: boolean;   // 自分の幅のつまみを出す
  leafKids: boolean;    // 子は子を持てない（フローチャートの要素。子を持つ箱は入れられず、子の中へも落とせない）
  tools: readonly Shape[];     // 道具入れ（toolbox.ts）に並べる、子として足せる形。空なら道具入れを出さない
  branchCaptions: readonly string[]; // 子のひし形（分岐）から出る線のキャプションの候補（線の編集ダイアログに出す）
  onWorld: boolean;     // ワールド（ページ）にも掛けられる（最上位の箱を並べる。今は内包とフローチャート）
  splitBranches: boolean; // 子のひし形（分岐）から出る線を、1 つの頂点から 2 本出さないように分けて出す（端を固定した線は除く）
  autoAlign: boolean;   // 位置の無い子を、決まった並べ方（layout/flow-align.ts）で置く。ユーザーが押す「自動で整列」も出す
  separateEnds: boolean; // 子に入る線が同じ位置につながるなら、折れ目の多い方を空いている近い辺へ逃がす（render.ts の separateEnds）
  kidGap: number | null; // 子どうしの間隔のローカルなルール（px）。null は全世界のルール（graph.ts の DEFAULTS.gap）。リストは詰めて並べる
  // 決まった並べ方（autoAlign）で置くときの、列の間（x）と段の間（y）。中の箱のサイズ（kidSize）ごと。top はワールドに置くとき一番上の段を下げる量
  align: { gaps: Record<Size, { x: number; y: number }>; top: number } | null;
  pairGaps: boolean;     // 子どうしに、組ごとの最小間隔（線でつながれば 32・キャプションがあれば 40px。layout.ts の gapBetween）を使うか。
                         // 使わない戦略は、子どうしをいつも kidGap（無ければ全世界の gap）で並べる（フローチャートは自分の整列の間隔を持つので使わない。
                         // 2026-10-12 ユーザー: 例外は、戦略が明示的に無視すると書いてあればよい）
}
const PLAIN = { leafKids: false, tools: [], branchCaptions: [], onWorld: false, splitBranches: false, autoAlign: false, separateEnds: false, kidGap: null, pairGaps: true, align: null } as const;
export const STRATEGIES: Record<ChildView, Strategy> = {
  nest:   { framed: true,  free: true,  descendants: false, reorder: false, link: true,  widthGrip: false, ...PLAIN, onWorld: true },
  tree:   { framed: false, free: false, descendants: true,  reorder: false, link: false, widthGrip: false, ...PLAIN },
  list:   { framed: true,  free: false, descendants: false, reorder: true,  link: false, widthGrip: true,  ...PLAIN, kidGap: 8 },
  hidden: { framed: false, free: false, descendants: false, reorder: false, link: true,  widthGrip: false, ...PLAIN },
  // フローチャート（docs/PATTERN-plan.md の 3.7 章。2026-10-11 ユーザー）: 内包と同じく子を自由に置き、子は子を持てない。
  // 形はどこでも同じに使える（フローチャートだけの形は持たない。2026-10-12 ユーザー）
  flow:   {
    framed: true,  free: true,  descendants: false, reorder: false, link: true,  widthGrip: false,
    leafKids: true, tools: ["box", "diamond", "circle", "hexagon", "parallelogram", "trapezoid", "db"],
    branchCaptions: ["Yes", "No"], onWorld: true, splitBranches: true, autoAlign: true, separateEnds: true, kidGap: null, pairGaps: false,
    // 整列の間隔（2026-10-12 ユーザー。線のキャプション Yes / No が入るくらい。触ってから調整する仮の値）
    align: { gaps: { S: { x: 40, y: 32 }, M: { x: 60, y: 48 }, L: { x: 80, y: 64 } }, top: 8 },
  },
};

// 箱が、ある戦略の子として並んだときの自分の見せ方。並べる側ではなく、並べられる箱の側の決まり（リストは子の中身に関与しない。
// 子が「リストに入ったときの自分の見せ方」を知っている。docs/PATTERN-plan.md の 3.6 章）。データは書き換えず、見せるときだけ使う
export interface PlacedLook {
  plainShape: boolean;  // 形を使わず、ボックスで見せる
  sharedSize: boolean;  // 葉の箱の見た目のサイズを、兄弟の葉の箱のうち一番大きいサイズにそろえる。高さは中身に合わせる
  fullCaption: boolean; // S サイズでもキャプションを切り詰めない（高さは折り返した文字に合わせる）
}
const AS_IS: PlacedLook = { plainShape: false, sharedSize: false, fullCaption: false };
const LOOKS: Record<ChildView, PlacedLook> = {
  nest: AS_IS, tree: AS_IS, hidden: AS_IS,
  // フローチャートの子は、S でもキャプションを切り詰めずに折り返す（2026-10-12 ユーザー）
  flow: { plainShape: false, sharedSize: false, fullCaption: true },
  list: { plainShape: true, sharedSize: true, fullCaption: true },
};
// 最上位はワールドの並べ方（内包なら今のまま）。形にその並べ方でのローカルなルール（形の表の placed）があれば、それで上書きする
// （例: 平行四辺形と台形はツリーの中ではボックスで見せる）。形は、データに書いた形で引く（shapeOf がこれを使うため）
export const lookOf = (n: Box): PlacedLook => {
  const by = placedBy(n);
  const own = isShape(n.src.shape) ? shapeDef(n.src.shape).placed[by] : undefined;
  return own ? { ...LOOKS[by], ...own } : LOOKS[by];
};

// ツリーは子孫全体に効く（docs/PATTERN-plan.md の 3.6 章）: ツリーの箱の中では、子孫の見せ方（childView）を全部無視して何段でもツリーに並べる。
// 混ぜたければ、ツリーを解除して（見せ方を内包に戻して）自分で組む
// n を並べている、子孫全体に効く戦略の箱（祖先のうち一番外のもの。無ければ null）
export function treeRootOf(n: Box): Box | null {
  let root: Box | null = null;
  for (let p = n.parent; p; p = p.parent) if (STRATEGIES[viewOf(p)].descendants) root = p;
  return root;
}
// ツリーの中の箱か（根の子孫）
export const inTreeOf = (n: Box): boolean => !!treeRootOf(n);

// 箱が自分の子をどう並べるか。子が無ければ leaf（childView を書いていても、子が無ければ葉の箱として描く）。
// 子孫全体に効く戦略の中の子を持つ箱は、自分の見せ方に関わらず、その戦略の節
export type Arrange = "leaf" | ChildView;
export function arrangeOf(n: Box): Arrange {
  if (!n.children.length) return "leaf";
  const root = treeRootOf(n);
  return root ? viewOf(root) : viewOf(n);
}
// 箱が子を並べる戦略（子が無ければ null）
export const strategyOf = (n: Box): Strategy | null => (n.children.length ? STRATEGIES[arrangeOf(n) as ChildView] : null);
// 箱を並べている親の並べ方（最上位はワールドが自由に置くので nest）
// （親は子を持つので leaf にはならない）
export const placedBy = (n: Box): ChildView => (n.parent ? (arrangeOf(n.parent) as ChildView) : worldViewOf(n.world));
// 中の箱のサイズ（フローチャートで一括で変えたもの。無ければ null）
export const kidSizeOf = (c: Container): Size | null => (isSize(c.src.kidSize) ? c.src.kidSize : null);
// 子の見せ方の既定（書いていなければ内包）
export const DEFAULT_VIEW: ChildView = "nest";
// ワールド（ページ）の子の見せ方。ワールドに掛けられる戦略だけ（無ければ内包）
export const worldViewOf = (w: World): ChildView => (isView(w.src.childView) && STRATEGIES[w.src.childView].onWorld ? w.src.childView : "nest");
// 入れ物（箱かワールド）が子を並べる戦略。子の無い箱は、自分の見せ方（子を置けばそれで並ぶ）
export const kidStrategyOf = (c: Container): Strategy =>
  STRATEGIES[c.isWorld ? worldViewOf(c) : arrangeOf(c) === "leaf" ? viewOf(c) : arrangeOf(c) as ChildView];
// 子を自由に置く箱か（落とした位置に置く。子が無くても、置けば自由に置く。ツリーの中の箱は、子を置けばツリーに並ぶ）
export const placesFreely = (n: Box): boolean => STRATEGIES[viewOf(n)].free && !inTreeOf(n);

// リストの子か（docs/LIST-plan.md）。見せ方は lookOf（リストに入ったときの自分の見せ方）
export const inList = (n: Box): boolean => placedBy(n) === "list" && !!n.parent;
// ツリーで並んでいる子か（子同士の線は描かない）
export const inTree = (n: Box): boolean => placedBy(n) === "tree" && !!n.parent;
// 親の中に入っている（ドラッグで自由に動かせる）子か。最上位も含む
export const inNest = (n: Box): boolean => STRATEGIES[placedBy(n)].free;
// 子を枠の中に入れて見せるボックス（子を持ち、戦略が枠で見せるもの）。枠と見出しで描き、形とサイズは使わない
export const isNesting = (n: Box): boolean => !!strategyOf(n)?.framed;
// 見た目が葉の箱か（子が無いか、子を隠して本体だけを見せる）
export const leafLike = (n: Box): boolean => arrangeOf(n) === "leaf" || arrangeOf(n) === "hidden";
// 非表示の親の下にいるか（ツリーの中の非表示は無視するので、並べ方で見る）
export const isHidden = (n: Box): boolean => ancestors(n).some(p => arrangeOf(p) === "hidden");

// 箱にできる操作（並べ方の戦略から決まる）
export interface Abilities {
  drag: boolean;      // 自分をドラッグで動かせる（でなければ、動かせる祖先を動かす。ツリーの子はツリー全体）
  reorder: boolean;   // 兄弟の中で並べ替えられる（リストの子）
  link: boolean;      // 線を引ける・〇を出す（ツリー・リストの子は自動で並ぶので、線を引くと形が崩れる）
  widthGrip: boolean; // 幅のつまみを出す（子を持つリスト）
  dropInto: boolean;  // 付け替えや追加で、中へ落とせる（ページの箱は中身が別のページ、クラスの箱とフローチャートの要素は子を持てない）
}
export function abilitiesOf(n: Box): Abilities {
  const by = STRATEGIES[placedBy(n)];
  return {
    drag: by.free,
    reorder: by.reorder && !!n.parent,
    link: !n.parent || by.link,
    widthGrip: !!strategyOf(n)?.widthGrip,
    dropInto: n.src.page !== true && shapeDef(shapeOf(n)).kids && !by.leafKids,
  };
}

// データのサイズ（無ければ M）
export const dataSizeOf = (n: Box): Size => (isSize(n.src.size) ? n.src.size : "M");
const SIZE_RANK: Record<Size, number> = { S: 0, M: 1, L: 2 };
// リストの葉の子の見た目のサイズ: 葉の子のうち一番大きいサイズ（S, M, M なら M。S だけなら S）
export function listSizeOf(list: Box): Size {
  const sizes = list.children.filter(leafLike).map(dataSizeOf);
  return sizes.length ? sizes.reduce((a, b) => (SIZE_RANK[b] > SIZE_RANK[a] ? b : a)) : "M";
}
// サイズ（L / M / S）が効くのは、見た目が葉の箱だけ（子の無い箱、ツリーの親の本体、非表示）。内包・リストの箱の大きさは子の並びで決まるので、
// サイズを使わない（データは消さずに無視する。子を全部外せば効く）。リストの葉の子は、リストの中で一番大きいサイズの見た目にそろえる（docs/SIZE-plan.md）
export const sizeOf = (n: Box): Size =>
  (lookOf(n).sharedSize && leafLike(n) ? listSizeOf(n.parent!) : isNesting(n) ? "M" : dataSizeOf(n));
export const viewOf = (n: Box): ChildView => (isView(n.src.childView) ? n.src.childView : "nest");
// ツリーの向き。ツリーの中の箱は根の向きに従う（自分の treeDirection は無視する）
export function treeDirOf(n: Box): TreeDirection {
  const s = (treeRootOf(n) ?? n).src;
  return isTreeDirection(s.treeDirection) ? s.treeDirection : "down";
}
// 子を内包しているボックスは枠なので、形は常にボックス
// ページの箱は、決まった形（タブ付きの見出し。render.ts）で描くので、形の指定は使わない
// 線のキャプションの候補: 始点が分岐の形（ひし形）で、それを並べる戦略が候補を持つとき（フローチャートの Yes / No）
export const captionHintsOf = (e: Edge): string[] =>
  (e.a !== e.b && shapeDef(shapeOf(e.a)).branch ? [...STRATEGIES[placedBy(e.a)].branchCaptions] : []);
// 分岐から出る線の頂点（2026-10-11 ユーザー。フローチャートの戦略）: 1 つの頂点から 2 本出さない（下と右のような組み合わせでもよい）。
// targets は線ごとの、分岐の中心から相手の中心への向き。avoid は入ってくる線が使う頂点（空いていれば避ける）。
// 頂点の向きと相手の向きのなす角の合計が一番小さい割り当てを選ぶ（4 本までは全部試す。5 本目からは割り当てない）
export type Vertex = "t" | "r" | "b" | "l";
const VERTEX_DIR: Record<Vertex, [number, number]> = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };
export function splitBranches(targets: [number, number][], avoid: Vertex[] = []): (Vertex | null)[] {
  const misfit = (v: Vertex, [dx, dy]: [number, number]) => {
    const [vx, vy] = VERTEX_DIR[v], len = Math.hypot(dx, dy) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (vx * dx + vy * dy) / len)));
  };
  if (targets.length > 4) return targets.map(() => null);
  const all: Vertex[] = ["b", "r", "l", "t"];
  const free = all.filter(v => !avoid.includes(v));
  const pool = free.length >= targets.length ? free : all;
  let best: Vertex[] = [], bestCost = Infinity;
  const pick = (i: number, used: Vertex[], cost: number) => {
    if (cost >= bestCost - 1e-9) return;
    if (i === targets.length) { best = used; bestCost = cost; return; }
    for (const v of pool) if (!used.includes(v)) pick(i + 1, [...used, v], cost + misfit(v, targets[i]!));
  };
  pick(0, [], 0);
  return best;
}

// 見せる形。子を内包する箱（枠）・ページの箱と、並べられた見せ方で形を使わない箱（リストの子など。lookOf）はボックス。データの形は残す
export const shapeOf = (n: Box): Shape => {
  if (isNesting(n) || lookOf(n).plainShape || n.src.page === true || !isShape(n.src.shape)) return DEFAULT_SHAPE;
  return n.src.shape;
};
// 入れ物 p の子にできるか（子を持てない戦略の子の中へは入れられず、子を持つ箱は子を持てない戦略の中へ入れられない）
export function acceptsKid(p: Container, kidHasKids: boolean): boolean {
  if (!p.isWorld && STRATEGIES[placedBy(p)].leafKids) return false;
  return !(kidHasKids && kidStrategyOf(p).leafKids);
}
// 線の端を辺の真ん中（頂点）に限る形か（形の表 shapes.ts）
export const vertexOnly = (s: Shape): boolean => shapeDef(s).vertexOnly;
// 斜めの辺を持つ形（六角形・平行四辺形・台形）の、斜めの辺が横に食い込む幅（S は小さく）。文字の左右の余白にもこの分を足す
// （graph-style.ts の .mz-shape-hexagon などの padding-inline と合わせる）
export const slantOf = (n: Box): number => shapeDef(shapeOf(n)).slant[sizeOf(n)];
// 線がつながる範囲を左右に縮める幅（平行四辺形と台形は、左右の辺の真ん中が本体の縁より内側にあるので、そこへつなぐ）
export const anchorInsetOf = (n: Box): number => {
  return shapeDef(shapeOf(n)).insetEnds ? slantOf(n) / 2 : 0;
};
// 絵の形（スティックマン・DB・サーバー）: 決まった大きさの絵の足元に文字を置く。背景は無い
export const isIconShape = (s: Shape): boolean => shapeDef(s).base === "icon";
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
export const displayCaption = (n: Box) => (lookOf(n).fullCaption ? captionOf(n) : truncate(captionOf(n), SIZES[sizeOf(n)].limit));
// 出す本文（無ければ空）。本文を持てるのは普通の箱で、S サイズ（高さが固定）以外（docs/BODY-plan.md）
export const canBody = (n: Box): boolean =>
  shapeDef(shapeOf(n)).body && sizeOf(n) !== "S" && n.src.page !== true && overflowOf(n) !== "clip";
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
