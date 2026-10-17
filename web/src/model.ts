// ボックスと線の内部の形と、ボックスの設定を読む関数。DOM の操作はしない

import { truncate } from "./dom";
import { DEFAULT_SHAPE, shapeDef } from "./shapes";
import { DEFAULT_LINK_LOOK, LINK_ICON_DEF, PREVIEW_ROW_DEF, type Rect as ClipRect, isLinkLook, isRect, linkRowHeight } from "./link-box";
import type { Arrangement, Arrow, BoxData, BoxView, Dash, Route, ChildView, EdgeData, LinkLook, Overflow, PagePattern, PreviewSide, Shape, Size, ToolKey, TreeDirection, WorldData } from "./types";
import type { EndMemory, EndPaths, Route as Routed, RouteShape, Segment } from "./routing";
import { ARROWS, SIZES, isPattern, isPreviewSide, isRoute, isShape, isSize, isTreeDirection, isView } from "./validate";

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
  // スクロールするリスト（D33。listHeight）: 子が始まる高さ（見出しと本文の下）と、中身の全体の高さ（node-kinds.ts の list が決める。保存しない）。
  // 中身が箱の高さを超えたら、子は見出しの下のスクロールする入れ物（kidsEl。render.ts が作る）に入る
  kidsTop: number;
  fullH: number;
  kidsEl: HTMLDivElement | null;
  heightGripEl: HTMLDivElement; // スクロールにしたリストの高さの上限を変えるつまみ（下の縁。選んでいるときだけ CSS で出す。D33）
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
  // リンクの箱の部品（link-box.ts。持ち手の帯と札、窓。リンクの箱でなければ隠す。大きさを測るときも隠す）
  linkEl: HTMLDivElement;
  linkBadge: HTMLSpanElement; // のぞくページのパターンの札
  linkWin: HTMLDivElement;    // 窓（押すとそのページへ）
  linkArt: SVGSVGElement;     // 窓の中の絵（のぞくページの縮図。preview-art.ts）
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
// パターンはページ単位（2026-10-12 ユーザー）: ページ（ワールド）の childView がページのパターン（内包・ツリー・フローチャート）で、
// 最上位の箱の並べ方を決める。箱の childView は内包パターンの持ち物（内包・リスト・非表示）で、子をどう並べるかの見せ方。
// ツリーのページは、根（world.root の箱）の子孫全体をツリーに並べる。根以外の最上位の箱は葉（自由に置く）。
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
  scroll: boolean;      // 高さの上限（listHeight）を持ち、超えた分を中だけスクロールできる（D33。下の縁のつまみと、ダイアログの「スクロール」）
  leafKids: boolean;    // 子は子を持てない（フローチャートの要素。子を持つ箱は入れられず、子の中へも落とせない）
  tools: readonly ToolKey[]; // ページのパターンのとき、道具箱（toolbox.ts。図の左端）に並べる道具（形・追加・マスターの操作。D26）。空なら道具箱を出さない
  branchCaptions: readonly string[]; // 子のひし形（分岐）から出る線のキャプションの候補（線の編集ダイアログに出す）
  onWorld: boolean;     // ページ（ワールド）に掛けられるパターンか（内包・ツリー・フローチャート・マスター）。箱の見せ方（内包・リスト・非表示）は onBox
  pick: boolean;        // 新しい図・新しいページのダイアログで選べるか（マスターは選ばせない。ファイルの形式は validate.ts の PAGE_FORMATS）
  onBox: boolean;       // 箱の childView に書けるか（内包パターンの持ち物）
  tops: ChildView;      // ページのパターンのとき、最上位の箱をどの戦略で置くか（ツリーのページは根の子孫だけを木にし、最上位は自由に置く）
  rootOnly: boolean;    // ページのパターンのとき、子を持てるのは根（world.root）の子孫だけ（ツリー）
  splitBranches: boolean; // 子のひし形（分岐）から出る線を、1 つの頂点から 2 本出さないように分けて出す（端を固定した線は除く）
  openMore: BoxView | null; // 非表示の箱の ▼ を押すと、この見せ方にして子を見せる（null なら ▼ は印だけ）。マスターの「その他のブック」をリストで開く（D26・D13）
  autoAlign: boolean;   // 位置の無い子を、決まった並べ方（layout/flow-align.ts）で置く。ユーザーが押す「自動で整列」も出す
  separateEnds: boolean; // 子に入る線が同じ位置につながるなら、折れ目の多い方を空いている近い辺へ逃がす（render.ts の separateEnds）
  kidGap: number | null; // 子どうしの間隔のローカルなルール（px）。null は全世界のルール（graph.ts の DEFAULTS.gap）。リストは詰めて並べる
  // 決まった並べ方（autoAlign）で置くときの、列の間（x）と段の間（y）。中の箱のサイズ（kidSize）ごと。top はワールドに置くとき一番上の段を下げる量
  // sideDrop は、分岐から分岐へ続くとき横に置く子の分岐を、親の中心から下げる量（layout/flow-align.ts）
  align: { gaps: Record<Size, { x: number; y: number }>; sideDrop: Record<Size, number>; top: number } | null;
  // ページに掛けたときのコピー・貼り付け（Ctrl+C / Ctrl+V。D23。2026-10-15 ユーザー: コピペの決まりはパターンが持つ）。
  // boxes は選んだ箱を子孫と中の線ごと写し、ワールドを選んでいればポインタの位置、箱を選んでいればその中の左上に貼る（子を入れられない箱なら隣。
  // 入れられるかは acceptsKid と形の表から引くので、フローチャートの箱は隣になる）。books はブックの窓を写し、貼るとブックを複製する（マスター）。null は写さない
  copy: "boxes" | "books" | null;
  paper: boolean;        // ページに掛けたとき、固定サイズの紙の制限を受けるか（D33。docs/PAPER-plan.md）。マスターのような特別なページは受けない（中身に合わせて伸びる）
  pairGaps: boolean;     // 子どうしに、組ごとの最小間隔（線でつながれば 32・キャプションがあれば 40px。layout.ts の gapBetween）を使うか。
                         // 使わない戦略は、子どうしをいつも kidGap（無ければ全世界の gap）で並べる（フローチャートは自分の整列の間隔を持つので使わない。
                         // 2026-10-12 ユーザー: 例外は、戦略が明示的に無視すると書いてあればよい）
}
const PLAIN = { copy: null, scroll: false, leafKids: false, tools: [], pick: false, openMore: null, branchCaptions: [], onWorld: false, onBox: false, rootOnly: false, splitBranches: false, autoAlign: false, separateEnds: false, kidGap: null, pairGaps: true, align: null, paper: false } as const;
const NEST: Strategy = { framed: true,  free: true,  descendants: false, reorder: false, link: true,  widthGrip: false, ...PLAIN, onWorld: true, onBox: true, pick: true, tops: "nest", tools: ["add"], paper: true, copy: "boxes" };
export const STRATEGIES: Record<ChildView, Strategy> = {
  nest:   NEST,
  // ツリー（ページのパターン）: 根（world.root）の子孫全体を木に並べる。最上位の箱（根も、根でない葉も）は自由に置く
  // 道具箱は追加だけ（ツリーは次の段階で作り込む。2026-10-14 ユーザー: それまでの暫定）
  tree:   { framed: false, free: false, descendants: true,  reorder: false, link: false, widthGrip: false, ...PLAIN, onWorld: true, pick: true, tops: "nest", rootOnly: true, tools: ["add"], paper: true, copy: "boxes" },
  list:   { framed: true,  free: false, descendants: false, reorder: true,  link: false, widthGrip: true,  ...PLAIN, onBox: true, tops: "list", kidGap: 8, scroll: true },
  hidden: { framed: false, free: false, descendants: false, reorder: false, link: true,  widthGrip: false, ...PLAIN, onBox: true, tops: "hidden" },
  // 縮図（D13。2026-10-14 ユーザー）: リストの子が子を持つときの見せ方。非表示と同じく子を描かず、子の代わりに中身の縮図を横に出す。
  // どの子がこれになるかはリストが決める（previewSide。データの childView には書けない）。縮図は押しても開かず、中身が見えるだけ
  preview: { framed: false, free: false, descendants: false, reorder: false, link: true,  widthGrip: false, ...PLAIN, tops: "nest" },
  // フローチャート（ページのパターン。docs/PATTERN-plan.md の 3.7 章。2026-10-11 ユーザー）: 内包と同じく子を自由に置き、子は子を持てない。
  // 形はどこでも同じに使える（フローチャートだけの形は持たない。2026-10-12 ユーザー）
  flow:   {
    framed: true,  free: true,  descendants: false, reorder: false, link: true,  widthGrip: false,
    leafKids: true, tools: ["box", "diamond", "circle", "hexagon", "parallelogram", "trapezoid", "db"],
    branchCaptions: ["Yes", "No"], onWorld: true, pick: true, openMore: null, onBox: false, tops: "flow", rootOnly: false, splitBranches: true, autoAlign: true, separateEnds: true, kidGap: null, pairGaps: false, paper: true, scroll: false, copy: "boxes",
    // 整列の間隔（2026-10-12 ユーザー。線のキャプション Yes / No が入るくらい。触ってから調整する仮の値）
    // 横に置く分岐を下げる量は、段の間の半分（2026-10-12 ユーザー）
    align: { gaps: { S: { x: 40, y: 32 }, M: { x: 60, y: 48 }, L: { x: 80, y: 64 } }, sideDrop: { S: 16, M: 24, L: 32 }, top: 8 },
  },
  // マスター（D26 の段階 2。docs/UI-plan.md。2026-10-14 ユーザー: パターンをプラグインして特別にした普通のページ）: 内包を土台に、
  // 違う所だけを上書きする（内包に足した決まりは、そのままマスターにも効く）。新しいページの選択肢には出さず（pick）、箱の見せ方にも使わない。
  // 道具箱はブック追加・ブックをまたぐ追加削除・設定。窓（book のある箱）でブックを並べる。ファイルの形式は validate.ts の PAGE_FORMATS
  master: { ...NEST, onBox: false, pick: false, openMore: "list", tools: ["newBook", "crossMove", "settings"], paper: false, copy: "books" }, // 紙の制限を受けない（ブックの数で伸びる）
};

// 箱が、ある戦略の子として並んだときの自分の見せ方。並べる側ではなく、並べられる箱の側の決まり（リストは子の中身に関与しない。
// 子が「リストに入ったときの自分の見せ方」を知っている。docs/PATTERN-plan.md の 3.6 章）。データは書き換えず、見せるときだけ使う
export interface PlacedLook {
  plainShape: boolean;  // 形を使わず、ボックスで見せる
  sharedSize: boolean;  // 箱のサイズ（L / M / S）を使わず普通の大きさ（M）で描き、高さは親の決めた最小の高さ（リストの高さ）に中身が収まる限り合わせる
  fullCaption: boolean; // S サイズでもキャプションを切り詰めない（高さは折り返した文字に合わせる）
  preview: boolean;     // 縮図を横に出す（D13）: 子を持つ子は子を描かずに中身の縮図、窓（リンクの箱）は横に分ける見せ方。位置は親の previewSide
}
const AS_IS: PlacedLook = { plainShape: false, sharedSize: false, fullCaption: false, preview: false };
const LOOKS: Record<ChildView, PlacedLook> = {
  nest: AS_IS, tree: AS_IS, hidden: AS_IS, master: AS_IS, preview: AS_IS,
  // フローチャートの子は、S でもキャプションを切り詰めずに折り返す（2026-10-12 ユーザー）
  flow: { ...AS_IS, fullCaption: true },
  list: { plainShape: true, sharedSize: true, fullCaption: true, preview: true },
};
// その見せ方の子が、縮図を横に出すか（リスト。子の見せ方のダイアログで「縮図の位置」を出すかに使う。D13）
export const previewsKids = (v: ChildView): boolean => LOOKS[v].preview;
// 最上位はワールドの並べ方（内包なら今のまま）。形にその並べ方でのローカルなルール（形の表の placed）があれば、それで上書きする
// （例: 平行四辺形と台形はツリーの中ではボックスで見せる）。形は、データに書いた形で引く（shapeOf がこれを使うため）
export const lookOf = (n: Box): PlacedLook => {
  const by = placedBy(n);
  const own = isShape(n.src.shape) ? shapeDef(n.src.shape).placed[by] : undefined;
  return own ? { ...LOOKS[by], ...own } : LOOKS[by];
};

// ツリーはページのパターンで、根（world.root）の子孫全体に効く（docs/PATTERN-plan.md）: 中では子孫の見せ方（childView）を全部無視して
// 何段でもツリーに並べる。根はそのページの最上位の箱で、自由に置く（つかむと木全体が動く）
// ページ（ワールド）のツリーの根の箱（ツリーのページでなければ null）
export function rootBoxOf(w: World): Box | null {
  if (!STRATEGIES[worldViewOf(w)].descendants || w.src.root == null) return null;
  return w.children.find(b => b.id === String(w.src.root)) ?? null;
}
export const isTreeRoot = (n: Box): boolean => !n.parent && rootBoxOf(n.world) === n;
// n を並べているツリーの根（n が根の子孫のとき。無ければ null）
export function treeRootOf(n: Box): Box | null {
  const root = rootBoxOf(n.world);
  return root && root !== n && ancestors(n).includes(root) ? root : null;
}
// ツリーの中の箱か（根の子孫）
export const inTreeOf = (n: Box): boolean => !!treeRootOf(n);

// 箱が自分の子をどう並べるか。子が無ければ leaf（childView を書いていても、子が無ければ葉の箱として描く）。
// ツリーの根とその子孫（子を持つもの）は、自分の見せ方に関わらずツリーの節
export type Arrange = "leaf" | ChildView;
// 縮図を横に出す並べ方（リスト）の子で、子を持つものは縮図（preview）。リストの中で中身をそのまま出すことはしない（一覧性を優先する。
// 2026-10-14 ユーザー）ので、縮図を出さない設定（none）なら非表示（文字だけの低い行と ▼）。非表示にした箱は非表示のまま
export function arrangeOf(n: Box): Arrange {
  if (!n.children.length) return "leaf";
  if (isTreeRoot(n) || treeRootOf(n)) return worldViewOf(n.world);
  const own = viewOf(n);
  if (!n.parent || !lookOf(n).preview) return own;
  return own === "hidden" || previewSideOf(n.parent) === "none" ? "hidden" : "preview";
}
// リストの子の縮図の位置（リストの previewSide。無ければ右）
export const previewSideOf = (list: Box): PreviewSide => (isPreviewSide(list.src.previewSide) ? list.src.previewSide : "right");
// 横に縮図を出す箱なら、その位置（右か左）。子を持って縮図になった子と、縮図を横に出す並べ方の中の窓（リンクの箱）。でなければ null
export function listPreviewOf(n: Box): "right" | "left" | null {
  if (!n.parent || !lookOf(n).preview) return null;
  const side = previewSideOf(n.parent);
  if (side === "none") return null;
  return isLinkBox(n) || arrangeOf(n) === "preview" ? side : null;
}
// 縮図を出さない並べ方（リストの none）の中の窓か。縮図の代わりに、押すと開くアイコンを右に出す（2026-10-14 ユーザー）
// 縮図の代わりに開くアイコンを出すか: 縮図を出さない見せ方（linkLook の icon。D29）か、縮図を出さないリストの中（D13）
export const linkIconOf = (n: Box): boolean => isLinkBox(n) && (n.src.linkLook === "icon" || (!!n.parent && lookOf(n).preview && previewSideOf(n.parent) === "none"));
// 子を描かない並べ方か（非表示と縮図）
export const hidesKids = (n: Box): boolean => arrangeOf(n) === "hidden" || arrangeOf(n) === "preview";
// 箱が子を並べる戦略（子が無ければ null）
export const strategyOf = (n: Box): Strategy | null => (n.children.length ? STRATEGIES[arrangeOf(n) as ChildView] : null);
// 箱を並べている親の並べ方。最上位はページのパターンが最上位の箱を置く戦略（STRATEGIES の tops。ツリーのページでも最上位は自由に置く）
// （親は子を持つので leaf にはならない）
export const placedBy = (n: Box): ChildView => (n.parent ? (arrangeOf(n.parent) as ChildView) : STRATEGIES[worldViewOf(n.world)].tops);
// 中の箱のサイズ（フローチャートで一括で変えたもの。無ければ null）
export const kidSizeOf = (c: Container): Size | null => { const v = c.isWorld ? (c.src as WorldData).kidSize : undefined; return isSize(v) ? v : null; }; // ページ（world）の設定
// 子の見せ方とページのパターンの既定（書いていなければ内包）
export const DEFAULT_VIEW: BoxView & PagePattern = "nest";
// ページ（ワールド）のパターン。ページに掛けられる戦略だけ（無ければ内包）
export const worldViewOf = (w: World): PagePattern => (isPattern(w.src.childView) && STRATEGIES[w.src.childView].onWorld ? w.src.childView : "nest");
// 入れ物（箱かワールド）が子を並べる戦略。ワールドは最上位の箱を置く戦略（tops）。子の無い箱は、自分の見せ方（子を置けばそれで並ぶ）
export const kidStrategyOf = (c: Container): Strategy =>
  STRATEGIES[c.isWorld ? STRATEGIES[worldViewOf(c)].tops : arrangeOf(c) === "leaf" ? viewOf(c) : arrangeOf(c) as ChildView];
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
export const leafLike = (n: Box): boolean => arrangeOf(n) === "leaf" || hidesKids(n);
// 非表示の親の下にいるか（ツリーの中の非表示は無視するので、並べ方で見る）
export const isHidden = (n: Box): boolean => ancestors(n).some(hidesKids);

// リンクの箱（link-box.ts。docs/PATTERN-plan.md）: link にページの id を書いた箱。ほかのページへの窓で、子を持てず、形・サイズ・子の見せ方は使わない
// リンクの箱（ページの窓）と、マスターの窓（ブックの窓。book）。どちらも窓を持ち、子を持てない（link-box.ts）
export const isLinkBox = (n: Box): boolean => n.src.link != null || n.src.book != null;
export const linkPageOf = (n: Box): string | null => (n.src.link == null ? null : String(n.src.link));
export const linkBookOf = (n: Box): string | null => (typeof n.src.book === "string" && n.src.book ? n.src.book : null);
// 縮図を横に出す並べ方（リスト）の中では、いつも横に分ける（D13。2026-10-14 ユーザー）
// 描くときの見せ方（リストの中は横に分ける。縮図を出さない（icon）も横に分ける形で描き、アイコンかは linkIconOf）
export const linkLookOf = (n: Box): LinkLook => (n.parent && lookOf(n).preview ? "side" : n.src.linkLook === "icon" ? "side" : isLinkLook(n.src.linkLook) ? n.src.linkLook : DEFAULT_LINK_LOOK);
// データに書いた見せ方（編集ダイアログの選択。無ければ既定）
export const dataLinkLookOf = (n: Box): LinkLook => (isLinkLook(n.src.linkLook) ? n.src.linkLook : DEFAULT_LINK_LOOK);
// 窓に映す範囲（のぞくページの座標。無ければ null = ページ全体）
export const clipOf = (n: Box): ClipRect | null => (isRect(n.src.clip) ? { ...n.src.clip } : null);

// 箱にできる操作（並べ方の戦略から決まる）
export interface Abilities {
  drag: boolean;      // 自分をドラッグで動かせる（でなければ、動かせる祖先を動かす。ツリーの子はツリー全体）
  reorder: boolean;   // 兄弟の中で並べ替えられる（リストの子）
  link: boolean;      // 線を引ける・〇を出す（ツリー・リストの子は自動で並ぶので、線を引くと形が崩れる）
  widthGrip: boolean; // 幅のつまみを出す（子を持つリスト）
  heightGrip: boolean; // 高さの上限のつまみを出す（スクロールにしたリスト。D33）
  dropInto: boolean;  // 付け替えや追加で、中へ落とせる（リンクの箱は窓なので中に入れられず、クラスの箱とフローチャートの要素は子を持てない）
}
export function abilitiesOf(n: Box): Abilities {
  const by = STRATEGIES[placedBy(n)];
  return {
    drag: by.free,
    reorder: by.reorder && !!n.parent,
    link: !n.parent || by.link,
    widthGrip: !!strategyOf(n)?.widthGrip,
    heightGrip: !!strategyOf(n)?.scroll && Number(n.src.listHeight) > 0,
    dropInto: shapeDef(shapeOf(n)).kids && !by.leafKids && !isLinkBox(n),
  };
}

// データのサイズ（無ければ M）
export const dataSizeOf = (n: Box): Size => (isSize(n.src.size) ? n.src.size : "M");
// リストの高さ（子の最小の高さ。D13。2026-10-14 ユーザー）: S は縮図の代わりにアイコンを出した窓の行、M は普通の箱、L は縮図のある行の高さ。
// 縮図を出すときも出さないときも選べる（2026-10-14 ユーザー）。行は中身が収まる限りこの高さで、収まらない行だけ高くなる
export const ROW_HEIGHTS: Record<Size, number> = {
  S: linkRowHeight(LINK_ICON_DEF),
  M: SIZES.M.h,
  L: linkRowHeight(PREVIEW_ROW_DEF),
};
export const rowSizeOf = (list: Box): Size => (isSize(list.src.rowSize) ? list.src.rowSize : "M");
// リストの子の最小の高さ
export const rowHeightOf = (list: Box): number => ROW_HEIGHTS[rowSizeOf(list)];
// サイズ（L / M / S）が効くのは、見た目が葉の箱だけ（子の無い箱、ツリーの親の本体、非表示）。内包・リストの箱の大きさは子の並びで決まるので、
// サイズを使わない（データは消さずに無視する。子を全部外せば効く）。リストの子もサイズを使わず普通の大きさ（高さはリストの高さ。D13）
export const sizeOf = (n: Box): Size =>
  (lookOf(n).sharedSize && leafLike(n) || isNesting(n) || isLinkBox(n) ? "M" : dataSizeOf(n));
export const viewOf = (n: Box): BoxView => (isView(n.src.childView) && STRATEGIES[n.src.childView].onBox ? n.src.childView : "nest");
// ツリーの向き（ツリーのページの world.treeDirection。既定は下）。箱で呼んでも、そのページの向き
export function treeDirOf(c: Container): TreeDirection {
  const w = c.isWorld ? c : c.world;
  return isTreeDirection(w.src.treeDirection) ? w.src.treeDirection : "down";
}
// ツリーの線の区間の並び: 親の本体 head の子に向いた辺の中央から主軸方向へ半分（gapY / 2）進み、副軸方向に分けて、各子の本体 kids の親に向いた辺へつなぐ。
// 画面の線（render.ts）とページの縮図（graph.ts の geometry と、描いていないページの近似）が同じ形を使う
type R4 = { x: number; y: number; w: number; h: number };
export function treeLinesBetween(dir: TreeDirection, head: R4, kids: R4[], gapY: number): [number, number][][] {
  const half = gapY / 2;
  const out: [number, number][][] = [];
  if (!kids.length) return out;
  if (dir === "down" || dir === "up") {
    const px = head.x + head.w / 2;
    const from = dir === "down" ? head.y + head.h : head.y;
    const mid = dir === "down" ? from + half : from - half;
    const xs = kids.map(k => k.x + k.w / 2);
    out.push([[px, from], [px, mid]], [[Math.min(px, ...xs), mid], [Math.max(px, ...xs), mid]]);
    kids.forEach((k, i) => out.push([[xs[i]!, mid], [xs[i]!, dir === "down" ? k.y : k.y + k.h]]));
  } else {
    const py = head.y + head.h / 2;
    const from = dir === "right" ? head.x + head.w : head.x;
    const mid = dir === "right" ? from + half : from - half;
    const ys = kids.map(k => k.y + k.h / 2);
    out.push([[from, py], [mid, py]], [[mid, Math.min(py, ...ys)], [mid, Math.max(py, ...ys)]]);
    kids.forEach((k, i) => out.push([[mid, ys[i]!], [dir === "right" ? k.x : k.x + k.w, ys[i]!]]));
  }
  return out;
}
// ツリーの節 n の線（n の左上からの座標）
export const treeLinesOf = (n: Box, gapY: number): [number, number][][] =>
  treeLinesBetween(treeDirOf(n), { x: n.hx, y: n.hy, w: n.hw, h: n.hh }, n.children.map(k => ({ x: k.x + k.hx, y: k.y + k.hy, w: k.hw, h: k.hh })), gapY);
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

// 見せる形。子を内包する箱（枠）と、並べられた見せ方で形を使わない箱（リストの子など。lookOf）はボックス。データの形は残す
export const shapeOf = (n: Box): Shape => {
  if (isNesting(n) || isLinkBox(n) || lookOf(n).plainShape || !isShape(n.src.shape)) return DEFAULT_SHAPE;
  return n.src.shape;
};
// 入れ物 p の子にできるか（子を持てない戦略の子の中へは入れられず、子を持つ箱は子を持てない戦略の中へ入れられない。
// ツリーのページで子を持てるのは根の子孫だけなので、根の外の最上位へは子を持つ箱を落とせず、根の外の葉の中へも落とせない）
export function acceptsKid(p: Container, kidHasKids: boolean): boolean {
  if (!p.isWorld && (STRATEGIES[placedBy(p)].leafKids || isLinkBox(p))) return false;
  if (kidHasKids && kidStrategyOf(p).leafKids) return false;
  const pattern = STRATEGIES[worldViewOf(p.isWorld ? p : p.world)];
  if (pattern.rootOnly) {
    if (p.isWorld) return !kidHasKids;
    if (!isTreeRoot(p) && !treeRootOf(p)) return false;
  }
  return true;
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
export const fillOf = (n: Box) => n.src.fill !== false;
export const borderOf = (n: Box) => (n.src.border != null ? !!n.src.border : isNesting(n));
export function overflowOf(c: Container): Overflow {
  // ワールドの大きさは表示領域と箱の範囲で決まり、はみ出すものがほとんど無いので、中身の扱いを使わない（データの overflow は無視する。2026-10-11）
  if (c.isWorld) return "wrap";
  // 文字のボックスは伸ばさない（伸ばすと折り返しに戻せなくなる）。子を持つ箱はつねに子に合わせて伸ばす（データの overflow は無視する。
  // 図が幅を決め、文字は図の都合で折り返す。docs/SIZE-plan.md）
  if (!c.children.length) return c.src.overflow === "clip" && !isLinkBox(c) ? "clip" : "wrap";
  return "grow";
}
// S は 10 文字で切る。リストの子は高さを中身に合わせるので切らない
export const displayCaption = (n: Box) => (lookOf(n).fullCaption ? captionOf(n) : truncate(captionOf(n), SIZES[sizeOf(n)].limit));
// 出す本文（無ければ空）。本文を持てるのは普通の箱で、S サイズ（高さが固定）以外（docs/BODY-plan.md）
export const canBody = (n: Box): boolean =>
  isLinkBox(n) || (shapeDef(shapeOf(n)).body && sizeOf(n) !== "S" && overflowOf(n) !== "clip");
export const bodyOf = (n: Box): string => (typeof n.src.body === "string" && n.src.body && canBody(n) ? n.src.body : "");
// 本文の最大行数（無ければ 0。制限なし）
export const bodyLinesOf = (n: Box): number => (Number.isInteger(n.src.bodyLines) && (n.src.bodyLines as number) > 0 ? n.src.bodyLines as number : 0);
// 本文の幅の指定（無ければ 0）
export const bodyWidthOf = (n: Box): number => (typeof n.src.bodyWidth === "number" && n.src.bodyWidth > 0 ? n.src.bodyWidth : 0);
// 内包する箱・リストの親の本文を折り返す幅（箱の幅として数える。余白を含む）。自動なら箱の幅いっぱい、つまみで変えていればその幅。
// 箱の幅は子の並びで決まり、本文はそれを超えない（図が優先。子を詰めて狭くなれば箱の幅で折り返し、覚えた幅は消さない）
export const bodyWrapW = (n: Box, w: number): number => Math.min(bodyWidthOf(n) || w, w);
// 本文の文字を折り返す幅（左右の余白 padding を除く）。配置で測る幅（layout/node-kinds.ts）と描く幅（render.ts）は、どちらもこれを使う
export const bodyTextW = (n: Box, w: number, padding: number): number => bodyWrapW(n, w) - 2 * padding;

// t が n 自身か、n の子孫か
export function isInside(t: Box, n: Box) {
  for (let m: Box | null = t; m; m = m.parent) if (m === n) return true;
  return false;
}
