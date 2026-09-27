/*
 * JSON から「線でつながったボックスの図」を描く。
 * - 全体は見えない「ワールド」ボックスの中にあり、ボックスはさらに子を持てる。
 * - 子の見せ方は「内包」（親の中に入れる）「ツリー」（組織図のように下へぶら下げる）「非表示」から選ぶ。
 * - ボックスはドラッグで移動でき、同じ階層のボックス同士は重ならない。
 * - 線は同じ階層（同じ親を持つボックス同士）でだけ引ける。
 * - 線をクリックすると消える。Ctrl（Mac は Cmd）+クリックでボックスを2つ選ぶと線が引かれる。
 * - クリックしたボックス（背景ならワールド）が選択され、onSelect で知らせる。
 *
 * 使い方:
 *   const graph = createGraph(document.getElementById('stage'), data, { onChange, onSelect });
 *   graph.toJSON();              // 現在の状態を反映したデータ
 *   graph.load(data);            // 別のデータで描き直す（検証エラーなら例外を投げ、表示はそのまま残る）。履歴は空にする
 *   graph.load(data, { keepHistory: true }); // 外部での変更として、履歴に1件足して描き直す
 *   graph.undo(); graph.redo();  // 履歴を戻る・進む（戻したら onChange で知らせる）
 *   graph.select(id);            // 選択する（null はワールド）
 *   graph.info(id);              // ボックス（null はワールド）の情報
 *   graph.update(id, patch);     // 変更する（caption, color, size, childView, fill, border, overflow）
 *   graph.dragging();            // ドラッグ中か（外部からの変更を、手を離すまで待つのに使う）
 *   graph.setMode(mode);         // ドラッグの働き: "move"（移動）/ "reparent"（親子の付け替え）
 *   graph.reparent(id, parentId, at); // id を parentId（null は最上位）の子にする。at は最上位へ移すときの位置
 *   graph.destroy();
 *
 * データ形式:
 *   {
 *     "world": { "width": 1600, "height": 900, "overflow": "wrap" },
 *     "nodes": [
 *       { "id": 1, "caption": "グループ", "color": "#3b82f6", "childView": "tree" },
 *       { "id": 2, "caption": "A", "parent": 1, "size": "M" },
 *       { "id": 3, "caption": "B", "color": "#ef4444", "x": 300, "y": 80,
 *         "width": 120, "height": 64, "fill": false, "border": true, "overflow": "clip" }
 *     ],
 *     "edges": [
 *       { "id": "e1", "from": 1, "to": 3 }   // [1, 3] の形でも読める
 *     ]
 *   }
 *   - world は省略できる。width, height が無ければ、表示領域と置かれているボックスの範囲の大きい方になる。
 *     background で背景色を付けられる（文字や線の色は、背景の明るさに合わせて切り替わる）。
 *   - ノードの項目はすべて省略できる。color の既定は白。
 *   - id は連番の数値を使う。省くと読み込み時に、既存の数値 id の続きから連番を振る。
 *   - parent に親ボックスの id を書くと、その子になる。x, y は親の左上からの位置（内包のときに使う）。
 *   - 位置が無いボックスは自動で配置する。
 *   - shape はボックスの形: "box"（既定）/ "person"（スティックマン。キャプションは足元）/ "db"（円柱）。
 *     子を内包しているボックスは枠なので、形は使わない（ツリーや非表示で見せているときは使う）。
 *   - size はボックスの大きさの段階:
 *       "L" … 既定。文字数の制限なし
 *       "M" … 14 文字まで（超えると … で切る）。幅と高さに上限あり
 *       "S" … 小さい固定サイズ・小さい文字。10 文字まで（超えると … で切る）
 *   - childView は子の見せ方: "nest"（内包、既定）/ "tree"（ツリー）/ "hidden"（非表示、▼ で子がいることを示す）
 *     treeDirection はツリーで子を置く向き: "down"（既定）/ "up" / "left" / "right"
 *   - fill: false で塗りつぶし無し（透明）、border で枠線の有無（既定は内包で子を持つボックスだけ枠線あり）。
 *   - overflow は中身（内包の子、または文字）の扱い:
 *       "wrap" … 幅に合わせて折り返す（幅は固定、高さは伸びる）
 *       "grow" … 中身に合わせてボックスを伸ばす（ワールドでは使えない）
 *       "clip" … ボックスの大きさで切り詰める
 *     既定は子を持つボックスが grow、持たないボックスとワールドが wrap。S サイズでは使わない。
 *     width, height は grow では最小サイズ、wrap では幅、clip では幅と高さになる。
 *   - 線は同じ parent を持つボックス同士（最上位同士を含む）でだけ引ける。
 *     ツリーの子同士の線は描かない（データには残り、内包に戻すと表示される）。
 *   - 線の id が無ければ自動で振る。toJSON() は線を常に { id, from, to } の形で返す。
 */

import { GRAPH_CSS, GRAPH_STYLE_ID } from "./graph-style";
import { SVGNS, injectStyle, isLightColor, truncate } from "./dom";
import type {
  BoxData, BoxInfo, ChildView, Diagram, EdgeData, Id, Info, Overflow, Patch, Shape, Size, TreeDirection, WorldData,
} from "./types";
import {
  OVERFLOWS, SHAPES, SIZES, assignIds, checkSettings, isShape, isSize, isTreeDirection, isView, normalizeEdge, validate,
} from "./validate";

export const DEFAULTS = {
  color: "#ffffff",
  gap: 8,        // 同じ階層のボックス同士の最小間隔
  padding: 12,   // 内包するボックスの内側の余白
  header: 30,    // 内包するボックスのキャプション欄の高さ
  treeGapX: 24,  // ツリーで横に並ぶ子の間隔
  treeGapY: 40,  // ツリーの親と子の縦の間隔
};

const PERSON_MIN_W = 64; // スティックマンの最小の幅

// スティックマン（viewBox 0 0 36 52）
const PERSON_SVG =
  '<g class="mz-figure"><circle cx="18" cy="8" r="6.5"/><path d="M18 14.5V33M5 21.5H31M18 33 7 50M18 33 29 50"/></g>';

export interface GraphOptions extends Partial<typeof DEFAULTS> {
  onChange?: (data: Diagram) => void;
  onSelect?: (info: Info) => void;
  onHistory?: (state: HistoryState) => void; // 戻れる・進めるかが変わったとき
  onNotice?: (text: string) => void;          // 利用者に知らせたいこと（付け替えで線を外したなど）
}

// ドラッグの働き。移動か、親子の付け替えか
export type Mode = "move" | "reparent";

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

// 履歴に残す件数
const HISTORY_LIMIT = 100;

export interface Graph {
  load(data: unknown, options?: { keepHistory?: boolean }): void;
  undo(): boolean;
  redo(): boolean;
  history(): HistoryState;
  select(id: Id | null): void;
  selected(): string | null;
  info(id: Id | null): Info;
  update(id: Id | null, patch: Patch): void;
  toJSON(): Diagram;
  dragging(): boolean;
  setMode(mode: Mode): void;
  mode(): Mode;
  reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }): boolean; // at は最上位へ移すときの位置
  destroy(): void;
}

// n.x, n.y, n.w, n.h は枠（子孫を含めた範囲）、n.hx, n.hy, n.hw, n.hh は枠内の本体（ヘッド）の位置と大きさ
interface Box {
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
interface World {
  isWorld: true;
  id: null;
  el: HTMLDivElement;
  x: number; y: number; w: number; h: number;
  src: WorldData;
  readonly children: Box[];
}

type Container = Box | World;

interface Edge {
  src: EdgeData;
  id: string;
  a: Box;
  b: Box;
  el: SVGGElement;
  lines: SVGLineElement[];
}

export function createGraph(container: HTMLElement, data: unknown, options: GraphOptions = {}): Graph {
  injectStyle(GRAPH_STYLE_ID, GRAPH_CSS);
  const opt = { ...DEFAULTS, ...options };
  container.classList.add("mz-stage");

  const worldEl = document.createElement("div");
  worldEl.className = "mz-world";
  container.appendChild(worldEl);
  const svg = document.createElementNS(SVGNS, "svg");

  let source: Diagram = { nodes: [] }; // 読み込んだデータ（保存時に未知の項目もそのまま残す）
  let nodes: Box[] = [];               // データの並び順
  let roots: Box[] = [];
  let byId = new Map<string, Box>();
  let edges: Edge[] = [];
  let drag: { n: Box; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
  let linking: Box | null = null;      // Ctrl+クリックで選んだ1つ目
  let mode: Mode = "move";
  // 付け替えのドラッグ。target は落とす先（null はワールド、undefined は落とせない場所）
  let lift: {
    n: Box; pointerId: number; sx: number; sy: number; offX: number; offY: number;
    ghost: HTMLElement | null; target: Box | null | undefined;
  } | null = null;
  let current: Box | null = null;      // 選択中（null はワールド）
  const boxOfEl = new WeakMap<Element, Box>();

  const world: World = {
    isWorld: true, id: null, el: worldEl, x: 0, y: 0, w: 0, h: 0, src: {},
    get children() { return roots; },
  };

  const containerOf = (n: Box): Container => n.parent ?? world;
  const siblings = (n: Box) => containerOf(n).children;
  const captionOf = (n: Box) => (n.src.caption != null ? String(n.src.caption) : String(n.src.id));

  function ancestors(n: Box): Box[] {
    const out: Box[] = [];
    for (let p = n.parent; p; p = p.parent) out.push(p);
    return out;
  }

  function descendants(n: Box): Box[] {
    return n.children.flatMap(c => [c, ...descendants(c)]);
  }

  function absPos(n: Box): [number, number] {
    let x = 0, y = 0;
    for (let m: Box | null = n; m; m = m.parent) { x += m.x; y += m.y; }
    return [x, y];
  }

  // ---- 設定値 ----

  const sizeOf = (n: Box): Size => (isSize(n.src.size) ? n.src.size : "L");
  const viewOf = (n: Box): ChildView => (isView(n.src.childView) ? n.src.childView : "nest");
  const treeDirOf = (n: Box): TreeDirection => (isTreeDirection(n.src.treeDirection) ? n.src.treeDirection : "down");
  // 内包しているボックス（子を持ち、見せ方が内包）
  const isNesting = (n: Box) => n.children.length > 0 && viewOf(n) === "nest";
  // 親の中に入っている（ドラッグで自由に動かせる）子か。最上位も含む
  const inNest = (n: Box) => !n.parent || viewOf(n.parent) === "nest";
  // 非表示の親の下にいるか
  const isHidden = (n: Box) => ancestors(n).some(p => viewOf(p) === "hidden");
  // ツリーで並んでいる子か（子同士の線は描かない）
  const inTree = (n: Box) => !!n.parent && viewOf(n.parent) === "tree";
  // 子を内包しているボックスは枠なので、形は常にボックス
  const shapeOf = (n: Box): Shape => (!isNesting(n) && isShape(n.src.shape) ? n.src.shape : "box");
  const fillOf = (n: Box) => n.src.fill !== false;
  const borderOf = (n: Box) => (n.src.border != null ? !!n.src.border : isNesting(n));
  function overflowOf(c: Container): Overflow {
    if (c.isWorld) return c.src.overflow === "clip" ? "clip" : "wrap";
    return c.src.overflow || (c.children.length ? "grow" : "wrap");
  }
  const displayCaption = (n: Box) => truncate(captionOf(n), SIZES[sizeOf(n)].limit);

  // 子を置ける領域の内側の余白
  function innerArea(c: Container) {
    return {
      left: opt.padding,
      top: c.isWorld ? opt.padding : opt.header,
      right: opt.padding,
      bottom: opt.padding,
    };
  }

  // 大きさが固定されている方向（grow 以外は幅、clip は高さも）。
  // ワールドは幅を固定し、高さは指定が無ければ下へ伸ばせる（横スクロールより縦スクロールの方が見やすい）
  function fixedSize(c: Container): { w: number | null; h: number | null } {
    if (c.isWorld) return { w: world.w, h: world.src.height ? world.h : null };
    const ov = overflowOf(c);
    return {
      w: ov === "grow" ? null : (c.specW || SIZES.L.w),
      h: ov === "clip" ? (c.specH || SIZES.L.h) : null,
    };
  }

  // ---- ワールドの大きさ ----

  // 指定が無ければ、表示領域と置かれているボックスの範囲の大きい方にする。
  // 表示領域が狭くなってもボックスは動かさず、はみ出た分はスクロールで見る
  function syncWorld() {
    const s = world.src;
    let right = 0, bottom = 0;
    for (const n of roots) {
      if (!n.hasPos || !n.w) continue;
      right = Math.max(right, n.x + n.w + opt.padding);
      bottom = Math.max(bottom, n.y + n.h + opt.padding);
    }
    world.w = Number(s.width) || Math.max(container.clientWidth, right);
    world.h = Number(s.height) || Math.max(container.clientHeight, bottom);
    worldEl.style.width = world.w + "px";
    worldEl.style.height = world.h + "px";
    worldEl.classList.toggle("mz-ov-clip", overflowOf(world) === "clip");
  }

  // 背景色。明るさに合わせて、ワールドの中の文字や線を見やすい配色にする（graph-style.ts の .mz-on-light / .mz-on-dark）
  function applyWorldStyle() {
    const bg = world.src.background;
    worldEl.style.background = bg || "";
    const light = bg ? isLightColor(bg) : null;
    worldEl.classList.toggle("mz-on-light", light === true);
    worldEl.classList.toggle("mz-on-dark", light === false);
  }

  // ---- 大きさ ----

  // 文字の大きさを測る（width が null なら1行のまま）
  function measure(n: Box, width: number | null): [number, number] {
    const s = n.head.style;
    const prev = [s.width, s.height] as const;
    s.width = width == null ? "max-content" : width + "px";
    s.height = "auto";
    const r: [number, number] = [n.head.offsetWidth, n.head.offsetHeight];
    [s.width, s.height] = prev;
    return r;
  }

  // ボックスとして見せるときの本体の大きさ。useSpec が false なら width, height, overflow を使わない
  function fitHead(n: Box, useSpec: boolean) {
    const z = SIZES[sizeOf(n)];
    if (shapeOf(n) === "person") {
      // 人の形と足元の文字。幅は文字に合わせ、長ければ折り返す（背景が無いので、固定の大きさは使わない）
      const maxText = Math.min(z.maxW || Infinity, (useSpec && n.specW) || SIZES.L.w);
      const w = Math.max(PERSON_MIN_W, Math.min(maxText, measure(n, null)[0]));
      n.hw = w;
      n.hh = measure(n, w)[1];
      return;
    }
    if (z.fixed) {
      n.hw = z.w;
      n.hh = z.h;
      return;
    }
    const maxW = z.maxW || Infinity;
    const maxH = z.maxH || Infinity;
    const ov = useSpec ? overflowOf(n) : "wrap";
    const minW = Math.min(maxW, (useSpec && n.specW) || z.w);
    const minH = Math.min(maxH, (useSpec && n.specH) || z.h);
    let w = minW, h = minH;
    if (ov === "wrap") {
      h = Math.max(minH, measure(n, minW)[1]);
    } else if (ov === "grow") {
      const [tw, th] = measure(n, null);
      w = Math.max(minW, tw);
      h = Math.max(minH, th);
    }
    n.hw = Math.min(maxW, w);
    n.hh = Math.min(maxH, h);
  }

  // 子を組織図のように並べる。上下なら横一列、左右なら縦一列にして、親をその中央にそろえる。
  // 全体を薄い枠で囲むので、周りに余白を取る（同じ階層との線は、この枠のふちにつなぐ）。
  // 向きごとに書き分けず、子を置く向きを「主軸」、それに直交する向きを「副軸」として扱う
  function layoutTree(n: Box) {
    const kids = n.children;
    const dir = treeDirOf(n);
    const vertical = dir === "down" || dir === "up";
    const forward = dir === "down" || dir === "right"; // 子が親より後ろ（下か右）に来るか
    const P = opt.padding;
    const GAP = opt.treeGapX; // 子どうしの間隔（副軸）
    const DIST = opt.treeGapY; // 親と子の間隔（主軸）
    // [主軸, 副軸] の大きさ
    const headSize = vertical ? [n.hh, n.hw] : [n.hw, n.hh];
    const kidSize = (k: Box) => (vertical ? [k.h, k.w] : [k.w, k.h]);
    const crossTotal = kids.reduce((s, k) => s + kidSize(k)[1]!, 0) + GAP * (kids.length - 1);
    const cross = Math.max(headSize[1]!, crossTotal);
    const kidsMain = Math.max(...kids.map(k => kidSize(k)[0]!));

    // 主軸: 親、間隔、子の順（前向き）か、子、間隔、親の順（後ろ向き）。子は親に向いた側の端をそろえる
    const headMain = forward ? P : P + kidsMain + DIST;
    const headCross = P + (cross - headSize[1]!) / 2;
    let c = P + (cross - crossTotal) / 2;
    const place = (k: Box, main: number, crossPos: number) => {
      if (vertical) { k.x = crossPos; k.y = main; } else { k.x = main; k.y = crossPos; }
    };
    for (const k of kids) {
      const [km, kc] = kidSize(k);
      place(k, forward ? P + headSize[0]! + DIST : P + kidsMain - km!, c);
      k.placed = true;
      c += kc! + GAP;
    }
    if (vertical) { n.hx = headCross; n.hy = headMain; } else { n.hx = headMain; n.hy = headCross; }
    const main = P + headSize[0]! + DIST + kidsMain + P;
    const crossAll = P + cross + P;
    if (vertical) { n.w = crossAll; n.h = main; } else { n.w = main; n.h = crossAll; }
  }

  // 同じ階層との線をつなぐ範囲（ボックスの左上からの位置）。ツリーで見せていれば枠全体、それ以外は本体
  function anchorRect(n: Box) {
    if (n.children.length && viewOf(n) === "tree") return { x: 0, y: 0, w: n.w, h: n.h };
    return { x: n.hx, y: n.hy, w: n.hw, h: n.hh };
  }

  function fit(n: Box) {
    const view = viewOf(n);
    if (!n.children.length || view === "hidden") {
      fitHead(n, !n.children.length);
      n.hx = 0; n.hy = 0;
      n.w = n.hw; n.h = n.hh;
      return;
    }
    if (view === "tree") {
      fitHead(n, false);
      layoutTree(n);
      return;
    }
    // 内包: 子に合わせる（指定サイズは最小値として扱う）
    const ov = overflowOf(n);
    const minW = n.specW || SIZES.L.w;
    const minH = n.specH || SIZES.L.h;
    let r = 0, b = 0;
    for (const c of n.children) {
      r = Math.max(r, c.x + c.w);
      b = Math.max(b, c.y + c.h);
    }
    n.w = ov === "grow" ? Math.max(minW, r + opt.padding) : minW;
    n.h = ov === "clip" ? minH : Math.max(minH, b + opt.padding);
    n.hx = 0; n.hy = 0;
    n.hw = n.w; n.hh = n.h;
  }

  function refitAncestors(n: Box) {
    for (const p of ancestors(n)) fit(p);
  }

  // ---- 重なり判定 ----

  // 親の中に収まる位置に寄せる（大きさが固定されていない方向は、親が伸びるので上限なし）
  function clamp(n: Box, x: number, y: number): [number, number] {
    if (!inNest(n)) return [x, y]; // ツリーの子は自動で並ぶ
    const c = containerOf(n);
    const a = innerArea(c);
    const pad = c.isWorld ? 0 : opt.padding;
    const minX = c.isWorld ? 0 : a.left;
    const minY = c.isWorld ? 0 : a.top;
    const f = fixedSize(c);
    const maxX = f.w != null ? f.w - pad - n.w : Infinity;
    const maxY = f.h != null ? f.h - pad - n.h : Infinity;
    return [
      Math.max(minX, Math.min(maxX, x)),
      Math.max(minY, Math.min(maxY, y)),
    ];
  }

  function overlaps(n: Box, x: number, y: number, o: Box) {
    const g = opt.gap;
    return x < o.x + o.w + g && x + n.w + g > o.x &&
           y < o.y + o.h + g && y + n.h + g > o.y;
  }

  function collides(n: Box, x: number, y: number) {
    if (!inNest(n)) return false;
    return siblings(n).some(o => o !== n && o.placed && overlaps(n, x, y, o));
  }

  // n と、n の移動で広がった祖先がすべて正しく置けているか
  function validChain(n: Box) {
    for (let m: Box | null = n; m; m = m.parent) {
      if (collides(m, m.x, m.y)) return false;
      const [cx, cy] = clamp(m, m.x, m.y);
      if (Math.abs(cx - m.x) > 0.5 || Math.abs(cy - m.y) > 0.5) return false;
    }
    return true;
  }

  const clamped = (m: Box) => {
    const [cx, cy] = clamp(m, m.x, m.y);
    return Math.abs(cx - m.x) <= 0.5 && Math.abs(cy - m.y) <= 0.5;
  };

  // 広がった祖先 m が兄弟にぶつかったら、相手を押しのける。before は広がる前の m の位置と大きさ。
  // 前に m の下にあった相手は下へ、右にあった相手は右へ押す。押した先でぶつかる相手も同じ向きに押す。
  // 左や上にあった相手とぶつかる、押した先が親に収まらない、などのときは false（呼び出し側で元に戻す）。
  // 動かした相手の元の位置は moved に残す
  function pushAway(m: Box, before: { x: number; y: number; w: number; h: number },
                    moved: Map<Box, [number, number]>): boolean {
    const g = opt.gap;
    // o を、by に重ならないよう dir の向きへ押す
    const push = (o: Box, dir: "down" | "right", by: Box, depth: number): boolean => {
      if (depth > 50) return false;
      const origX = o.x, origY = o.y;
      if (!moved.has(o)) moved.set(o, [o.x, o.y]);
      if (dir === "down") o.y = by.y + by.h + g;
      else o.x = by.x + by.w + g;
      if (!clamped(o)) return false;
      for (const p of siblings(m)) {
        if (p === o || p === m || !p.placed || !overlaps(o, o.x, o.y, p)) continue;
        // 押した相手の先（下か右）にあるものだけ、続けて押す
        const ahead = dir === "down" ? p.y >= origY - 0.5 : p.x >= origX - 0.5;
        if (!ahead || !push(p, dir, o, depth + 1)) return false;
      }
      return true;
    };
    for (const o of siblings(m)) {
      if (o === m || !o.placed || !overlaps(m, m.x, m.y, o)) continue;
      if (o.y >= before.y + before.h - 0.5) {
        if (!push(o, "down", m, 0)) return false;
      } else if (o.x >= before.x + before.w - 0.5) {
        if (!push(o, "right", m, 0)) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  // n を動かしたあと、n が正しく置けているか確かめ、広がった祖先の周りを押しのける
  function settleChain(n: Box, before: Map<Box, { x: number; y: number; w: number; h: number }>,
                       moved: Map<Box, [number, number]>): boolean {
    if (collides(n, n.x, n.y) || !clamped(n)) return false;
    for (const m of ancestors(n)) {
      fit(m); // 下の階層で押しのけた分を反映する
      if (!clamped(m)) return false;
      if (collides(m, m.x, m.y) && !pushAway(m, before.get(m)!, moved)) return false;
    }
    return true;
  }

  // 目標位置に向けて動かす。重なる場合は、ぶつかった相手の外側へ押し出し、
  // それでも無理なら軸ごとにスライドさせ、最後は動かさない。
  // n の移動で広がった親が隣にぶつかったら、隣を押しのける（pushAway）
  function tryMove(n: Box, tx: number, ty: number) {
    const ox = n.x, oy = n.y;
    // すでに重なっているなら、引き離せるよう重なりの判定をしない（重なったままだと、どこへも動けなくなる）
    const stuck = !validChain(n);
    const attempt = ([x, y]: [number, number]) => {
      const before = new Map(ancestors(n).map(m => [m, { x: m.x, y: m.y, w: m.w, h: m.h }]));
      const moved = new Map<Box, [number, number]>();
      n.x = x; n.y = y;
      refitAncestors(n);
      if (stuck || settleChain(n, before, moved)) return true;
      for (const [b, [bx, by]] of moved) { b.x = bx; b.y = by; }
      n.x = ox; n.y = oy;
      refitAncestors(n);
      return false;
    };

    [tx, ty] = clamp(n, tx, ty);
    if (attempt([tx, ty])) return true;

    let x = tx, y = ty;
    for (let i = 0; i < 6; i++) {
      const hit = siblings(n).find(o => o !== n && overlaps(n, x, y, o));
      if (!hit) break;
      const g = opt.gap;
      const pushL = (x + n.w + g) - hit.x;
      const pushR = (hit.x + hit.w + g) - x;
      const pushU = (y + n.h + g) - hit.y;
      const pushD = (hit.y + hit.h + g) - y;
      const m = Math.min(pushL, pushR, pushU, pushD);
      if (m === pushL) x -= pushL;
      else if (m === pushR) x += pushR;
      else if (m === pushU) y -= pushU;
      else y += pushD;
      [x, y] = clamp(n, x, y);
    }
    if (Math.hypot(x - ox, y - oy) < 80 && attempt([x, y])) return true;

    if (attempt(clamp(n, tx, oy))) return true;
    if (attempt(clamp(n, ox, ty))) return true;
    return false;
  }

  // ---- 配置 ----

  // 親の中で、左上から格子状に空きを探す
  function findGridSpot(n: Box): [number, number] {
    const c = containerOf(n);
    const sibs = siblings(n);
    const a = innerArea(c);
    const cw = Math.max(...sibs.map(s => s.w)) + opt.gap;
    const ch = Math.max(...sibs.map(s => s.h)) + opt.gap;
    const f = fixedSize(c);
    let cols = Math.max(1, Math.ceil(Math.sqrt(sibs.length)));
    if (f.w != null) cols = Math.max(1, Math.min(cols, Math.floor((f.w - a.left - a.right + opt.gap) / cw)));
    for (let i = 0; i < 10000; i++) {
      const x = a.left + (i % cols) * cw;
      const y = a.top + Math.floor(i / cols) * ch;
      if (!collides(n, x, y)) return [x, y];
    }
    return [a.left, a.top];
  }

  // ワールド内で (x, y) に近い空きを探す
  function findFreeSpot(n: Box, x: number, y: number): [number, number] {
    const maxR = Math.max(world.w, world.h);
    for (let r = 0; r <= maxR; r += 16) {
      const step = r === 0 ? 360 : Math.max(5, 360 / (r / 4));
      for (let a = 0; a < 360; a += step) {
        const [cx, cy] = clamp(n,
          x + r * Math.cos((a * Math.PI) / 180),
          y + r * Math.sin((a * Math.PI) / 180));
        if (!collides(n, cx, cy)) return [cx, cy];
      }
    }
    return [x, y]; // 置き場が無いほど狭い場合は重なりを許容する
  }

  // 位置指定のあるものを優先して1つずつ置き、重なるものは空きへ逃がす
  // first を指定すると、それを最初に置く（変更したボックスをその場に残し、相手の方をずらすため）
  function placeGroup(list: Box[], spot: (n: Box) => [number, number], first?: Box) {
    for (const n of list) n.placed = false;
    const rest = list.filter(n => n !== first);
    const order = (first && list.includes(first) ? [first] : [])
      .concat(rest.filter(n => n.hasPos), rest.filter(n => !n.hasPos));
    for (const n of order) {
      [n.x, n.y] = clamp(n, n.x, n.y);
      if (!n.hasPos || collides(n, n.x, n.y)) [n.x, n.y] = spot(n);
      n.placed = true;
      n.hasPos = true;
    }
  }

  // 子から順に大きさと配置を決める
  function settleTree(n: Box) {
    n.children.forEach(settleTree);
    if (isNesting(n)) placeGroup(n.children, findGridSpot);
    fit(n);
  }

  // 位置のあるボックスが重なったら、同じ x のまま下へずらす（周りを探すより元の並びが崩れにくい）。
  // 位置の無いボックスは、置こうとした場所の近くの空きを探す
  function settleRoots(first?: Box) {
    placeGroup(roots, n => (n.hasPos ? spotBelow(n) : findFreeSpot(n, n.x, n.y)), first);
  }

  function spotBelow(n: Box): [number, number] {
    let y = n.y;
    // ワールドの高さが指定されていれば、下にも限りがある
    const maxY = world.src.height ? world.h - n.h : Infinity;
    while (collides(n, n.x, y) && y <= maxY) y += opt.gap;
    return y <= maxY ? [n.x, y] : findFreeSpot(n, n.x, n.y);
  }

  // 大きさが変わったあとに、全体を重なりの無い状態へ直す。changed は変更したボックス（その最上位をその場に残す）
  function settleAll(changed?: Box) {
    roots.forEach(settleTree);
    syncWorld();
    settleRoots(changed ? (ancestors(changed).pop() ?? changed) : undefined);
    syncWorld();
  }

  // 最初の配置。位置の無い最上位のボックスは円形に並べる
  function layout(fit = true) {
    roots.forEach(settleTree);
    syncWorld();
    const auto = roots.filter(n => !n.hasPos);
    const R = Math.min(world.w, world.h) * 0.3 + 40;
    auto.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / auto.length;
      n.x = world.w / 2 + R * Math.cos(a) - n.w / 2;
      n.y = world.h / 2 + R * Math.sin(a) - n.h / 2;
    });
    settleRoots();
    syncWorld();
    if (fit) fitToViewport();
  }

  // 読み込んだ直後だけ、表示領域の右にはみ出した最上位のボックスを下へ移す（横スクロールより縦の方が見やすい）。
  // つながる相手が表示領域に収まっていれば、その真下に中心をそろえて置く。無ければ全体の一番下の左端に置く。
  // 表示の上だけで動かし、ファイルには次に編集したときに保存される。
  // ワールドの幅が指定されている、または表示領域より大きいボックスは動かさない
  function fitToViewport() {
    const limit = container.clientWidth - opt.padding;
    if (world.src.width || limit <= 0) return;
    const inside = (n: Box) => n.x + n.w <= limit;
    const centerOffset = (n: Box) => { const r = anchorRect(n); return r.x + r.w / 2; };
    const over = roots.filter(n => !inside(n) && n.w <= limit - opt.padding).sort((a, b) => a.x - b.x);
    if (!over.length) return;
    for (const n of over) {
      const anchor = edges
        .filter(e => e.a === n || e.b === n)
        .map(e => (e.a === n ? e.b : e.a))
        .find(o => !o.parent && inside(o));
      const minX = opt.padding, maxX = limit - n.w;
      const x = anchor
        ? Math.max(minX, Math.min(maxX, anchor.x + centerOffset(anchor) - centerOffset(n)))
        : minX;
      let y = anchor
        ? anchor.y + anchor.h + opt.treeGapY
        : Math.max(...roots.filter(o => o !== n && inside(o)).map(o => o.y + o.h), 0) + opt.treeGapY;
      // ぶつかれば下へずらす
      while (collides(n, x, y)) y += opt.gap;
      n.x = x;
      n.y = y;
    }
    syncWorld();
  }

  // ---- 描画 ----

  // 見せ方に合わせて、本体の形・色・文字・子の表示を整える
  function applyStyle(n: Box) {
    const head = n.head;
    const color = n.src.color || opt.color;
    const group = isNesting(n);
    const view = viewOf(n);
    const size = sizeOf(n);
    const fill = fillOf(n);

    head.classList.toggle("mz-group", group);
    head.classList.toggle("mz-leaf", !group);
    for (const s of Object.keys(SIZES)) head.classList.toggle("mz-size-" + s, s === size);
    // 文字の扱いは子を持たないボックスだけが overflow に従う（S は固定の大きさの中で折り返す）
    const textOv = n.children.length || size === "S" || shapeOf(n) === "person" ? "wrap" : overflowOf(n);
    for (const ov of OVERFLOWS) head.classList.toggle("mz-ov-" + ov, !group && textOv === ov);
    n.el.classList.toggle("mz-clip", group && overflowOf(n) === "clip");

    const shape = shapeOf(n);
    for (const sh of SHAPES) head.classList.toggle("mz-shape-" + sh, sh === shape);
    // 文字を塗りの上に書くのは、ボックスと DB（塗りつぶしあり）だけ
    const onFill = !group && fill && shape !== "person";
    const light = onFill && isLightColor(color);
    head.classList.toggle("mz-dark", onFill && light);
    head.classList.toggle("mz-light", onFill && !light);
    const edge = `color-mix(in srgb, ${color} 70%, #000)`;
    if (shape === "box") {
      head.style.background = !fill ? "transparent"
        : group ? `color-mix(in srgb, ${color} 16%, transparent)` : color;
      const shadow: string[] = [];
      if (borderOf(n)) shadow.push(`inset 0 0 0 2px ${group || !fill ? color : edge}`);
      if (fill) shadow.push("var(--mz-shadow)");
      head.style.boxShadow = shadow.join(", ") || "none";
      n.shapeSvg.replaceChildren();
    } else {
      // 形は SVG で描くので、ボックスの背景と影は使わない
      head.style.background = "transparent";
      head.style.boxShadow = "none";
      const svg = n.shapeSvg;
      if (shape === "person") {
        svg.setAttribute("viewBox", "0 0 36 52");
        svg.innerHTML = PERSON_SVG;
        // 色の指定が無ければ文字の色で描く（白だと明るいテーマで見えないため）
        svg.style.stroke = n.src.color ? color : "var(--mz-text)";
        svg.style.fill = "";
        svg.style.filter = "";
      } else {
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<path class="mz-db-body"/><path class="mz-db-rim" fill="none"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = fill ? edge : color;
        svg.style.strokeWidth = "1.5";
        svg.style.filter = fill ? "drop-shadow(var(--mz-shadow))" : "";
      }
    }

    const caption = captionOf(n);
    const shown = displayCaption(n);
    n.textEl.className = group ? "mz-caption" : "mz-text";
    n.textEl.style.lineHeight = group ? opt.header + "px" : "";
    n.textEl.textContent = shown;
    head.title = shown !== caption ? caption : "";

    n.moreEl.hidden = !(n.children.length && view === "hidden");
    n.moreEl.title = `子 ${n.children.length} 件`;
    n.treeSvg.style.display = n.children.length && view === "tree" ? "" : "none";
    // 色の指定が無ければ線と同じ色にする（白だと明るいテーマで見えないため）
    n.treeFrame.style.stroke = n.src.color ? `color-mix(in srgb, ${color} 55%, transparent)` : "var(--mz-edge)";
    n.treeFrame.style.fill = `color-mix(in srgb, ${color} 5%, transparent)`;
    for (const k of n.children) k.el.style.display = view === "hidden" ? "none" : "";
  }

  // DB の円柱。胴（上面の奥の縁から底の手前の縁まで）を塗り、上面の手前の縁を線で描く
  function renderDb(n: Box) {
    const ry = sizeOf(n) === "S" ? 6 : 8; // graph-style.ts の .mz-shape-db の上下の余白と合わせる
    const x0 = 1, x1 = n.hw - 1, top = ry + 1, bottom = n.hh - ry - 1;
    const rx = (x1 - x0) / 2;
    const [body, rim] = n.shapeSvg.children;
    body?.setAttribute("d",
      `M${x0},${top}A${rx},${ry} 0 0 1 ${x1},${top}V${bottom}A${rx},${ry} 0 0 1 ${x0},${bottom}Z`);
    rim?.setAttribute("d", `M${x0},${top}A${rx},${ry} 0 0 0 ${x1},${top}`);
  }

  // ツリーの折れ線: 親から1本下ろし、横に分けて各子の上へつなぐ
  function renderTree(n: Box) {
    if (!n.children.length || viewOf(n) !== "tree") return;
    n.treeSvg.setAttribute("width", String(n.w));
    n.treeSvg.setAttribute("height", String(n.h));
    // 親の子に向いた辺の中央から主軸方向へ半分進み、副軸方向に分けて、各子の親に向いた辺へつなぐ
    const dir = treeDirOf(n);
    const half = opt.treeGapY / 2;
    const d: string[] = [];
    if (dir === "down" || dir === "up") {
      const px = n.hx + n.hw / 2;
      const from = dir === "down" ? n.hy + n.hh : n.hy;
      const mid = dir === "down" ? from + half : from - half;
      const xs = n.children.map(k => k.x + k.hx + k.hw / 2);
      d.push(`M${px},${from}V${mid}`, `M${Math.min(px, ...xs)},${mid}H${Math.max(px, ...xs)}`);
      n.children.forEach((k, i) => d.push(`M${xs[i]},${mid}V${dir === "down" ? k.y + k.hy : k.y + k.hy + k.hh}`));
    } else {
      const py = n.hy + n.hh / 2;
      const from = dir === "right" ? n.hx + n.hw : n.hx;
      const mid = dir === "right" ? from + half : from - half;
      const ys = n.children.map(k => k.y + k.hy + k.hh / 2);
      d.push(`M${from},${py}H${mid}`, `M${mid},${Math.min(py, ...ys)}V${Math.max(py, ...ys)}`);
      n.children.forEach((k, i) => d.push(`M${mid},${ys[i]}H${dir === "right" ? k.x + k.hx : k.x + k.hx + k.hw}`));
    }
    n.treePath.setAttribute("d", d.join(""));
    const f = n.treeFrame;
    f.setAttribute("width", String(Math.max(0, n.w - 1.5)));
    f.setAttribute("height", String(Math.max(0, n.h - 1.5)));
  }

  // 中心 (cx, cy) から (dx, dy) 方向へ伸ばした線が矩形の縁と交わる点
  function clipToRect(cx: number, cy: number, w: number, h: number, dx: number, dy: number): [number, number] {
    const tx = dx ? (w / 2) / Math.abs(dx) : Infinity;
    const ty = dy ? (h / 2) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty, 1);
    return [cx + dx * t, cy + dy * t];
  }

  // 線は本体どうしを結ぶ。非表示の子や、ツリーの子同士の線は描かない（データには残す）
  function renderEdges() {
    for (const e of edges) {
      const hidden = isHidden(e.a) || isHidden(e.b) || inTree(e.a);
      e.el.style.display = hidden ? "none" : "";
      if (hidden) continue;
      const [ax, ay] = absPos(e.a);
      const [bx, by] = absPos(e.b);
      const ra = anchorRect(e.a), rb = anchorRect(e.b);
      const acx = ax + ra.x + ra.w / 2, acy = ay + ra.y + ra.h / 2;
      const bcx = bx + rb.x + rb.w / 2, bcy = by + rb.y + rb.h / 2;
      const [x1, y1] = clipToRect(acx, acy, ra.w, ra.h, bcx - acx, bcy - acy);
      const [x2, y2] = clipToRect(bcx, bcy, rb.w, rb.h, acx - bcx, acy - bcy);
      for (const l of e.lines) {
        l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
        l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
      }
    }
  }

  function render() {
    for (const n of nodes) {
      const s = n.el.style;
      s.left = n.x + "px";
      s.top = n.y + "px";
      s.width = n.w + "px";
      s.height = n.h + "px";
      const h = n.head.style;
      h.left = n.hx + "px";
      h.top = n.hy + "px";
      h.width = n.hw + "px";
      h.height = n.hh + "px";
      if (shapeOf(n) === "db") renderDb(n);
      renderTree(n);
    }
    renderEdges();
  }

  function blocked(n: Box) {
    if (n.el.classList.contains("mz-blocked")) return;
    n.el.classList.add("mz-blocked");
    setTimeout(() => n.el.classList.remove("mz-blocked"), 180);
  }

  function changed() {
    record();
    opt.onChange?.(api.toJSON());
  }

  // ---- 履歴 ----
  // 変更のたびに図全体の JSON を1件として残す。戻るときはそれを読み込み直す

  let past: string[] = []; // 最後が今の状態
  let future: string[] = [];

  const historyState = (): HistoryState => ({ canUndo: past.length > 1, canRedo: future.length > 0 });
  const notifyHistory = () => opt.onHistory?.(historyState());

  function record() {
    const s = JSON.stringify(api.toJSON());
    if (s === past[past.length - 1]) return;
    past.push(s);
    if (past.length > HISTORY_LIMIT) past.shift();
    future = [];
    notifyHistory();
  }

  function resetHistory() {
    past = [JSON.stringify(api.toJSON())];
    future = [];
    notifyHistory();
  }

  // 記録した状態に戻す。選択は保ち、読み込み直後のはみ出しの調整はしない（記録どおりに戻すため）
  function restore(s: string) {
    const sel = current?.id ?? null;
    build(JSON.parse(s), false);
    if (sel != null && byId.has(sel)) select(byId.get(sel)!);
    opt.onChange?.(api.toJSON());
    notifyHistory();
  }

  function undo() {
    if (past.length <= 1) return false;
    future.push(past.pop()!);
    restore(past[past.length - 1]!);
    return true;
  }

  function redo() {
    const s = future.pop();
    if (s == null) return false;
    past.push(s);
    restore(s);
    return true;
  }

  function notifySelect() {
    opt.onSelect?.(info(current));
  }

  // ---- フォーカス（Obsidian 風: 関係の無いものを薄くする） ----

  function focus(n: Box) {
    const near = new Set([n, ...descendants(n)]);
    for (const e of edges) {
      const on = e.a === n || e.b === n;
      if (on) { near.add(e.a); near.add(e.b); }
      e.el.classList.toggle("mz-hi", on);
      e.el.classList.toggle("mz-dim", !on);
    }
    for (const m of [...near]) ancestors(m).forEach(p => near.add(p));
    for (const o of nodes) o.el.classList.toggle("mz-dim", !near.has(o));
  }

  function unfocus() {
    for (const e of edges) e.el.classList.remove("mz-hi", "mz-dim");
    for (const o of nodes) o.el.classList.remove("mz-dim");
  }

  // ---- 選択 ----

  function select(n: Box | null) {
    (current ?? world).el.classList.remove("mz-current");
    current = n;
    (current ?? world).el.classList.add("mz-current");
    notifySelect();
  }

  function setLinking(n: Box | null) {
    linking?.el.classList.remove("mz-linking");
    linking = n;
    n?.el.classList.add("mz-linking");
  }

  // ---- 線の追加・削除 ----

  function newEdgeId() {
    const used = new Set(edges.map(e => e.id));
    let i = edges.length + 1;
    while (used.has("e" + i)) i++;
    return "e" + i;
  }

  function canLink(a: Box, b: Box) {
    if (a === b || a.parent !== b.parent || inTree(a)) return false;
    return !edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  function addEdge(src: EdgeData, a: Box, b: Box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "mz-edge");
    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("class", "mz-line");
    const hit = document.createElementNS(SVGNS, "line");
    hit.setAttribute("class", "mz-hit");
    const title = document.createElementNS(SVGNS, "title");
    title.textContent = "クリックで線を削除";
    hit.appendChild(title);
    g.append(line, hit);
    svg.appendChild(g);
    const e: Edge = { src, id: String(src.id), a, b, el: g, lines: [line, hit] };
    hit.addEventListener("click", ev => {
      ev.stopPropagation();
      removeEdge(e);
    });
    edges.push(e);
    return e;
  }

  function removeEdge(e: Edge) {
    e.el.remove();
    edges = edges.filter(x => x !== e);
    unfocus();
    changed();
    notifySelect();
  }

  function ctrlClick(n: Box) {
    if (!linking) return setLinking(n);
    if (linking === n) return setLinking(null);
    if (!canLink(linking, n)) {
      blocked(n);
      return;
    }
    const a = linking;
    addEdge({ id: newEdgeId(), from: a.src.id!, to: n.src.id! }, a, n);
    setLinking(null);
    renderEdges();
    changed();
    notifySelect();
  }

  // ---- ポインタ操作 ----

  function boxOf(target: EventTarget | null): Box | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest(".mz-node");
    return el && container.contains(el) ? boxOfEl.get(el) ?? null : null;
  }

  const onEdge = (target: EventTarget | null) => target instanceof Element && !!target.closest(".mz-edge");

  // ツリーの子は自分では動かず、ツリー全体（内包されている祖先）を動かす
  function dragTarget(n: Box): Box {
    let m = n;
    while (!inNest(m) && m.parent) m = m.parent;
    return m;
  }

  function onPointerDown(e: PointerEvent) {
    const n = boxOf(e.target);
    if (!n) {
      if (!onEdge(e.target)) {
        setLinking(null);
        select(null);
      }
      return;
    }
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      ctrlClick(n);
      return;
    }
    if (current !== n) select(n);
    if (mode === "reparent") {
      const r = n.el.getBoundingClientRect();
      n.head.setPointerCapture(e.pointerId);
      lift = { n, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
        offX: e.clientX - r.left, offY: e.clientY - r.top, ghost: null, target: undefined };
      return;
    }
    const d = dragTarget(n);
    n.head.setPointerCapture(e.pointerId);
    drag = { n: d, sx: e.clientX, sy: e.clientY, ox: d.x, oy: d.y, moved: false };
    d.el.classList.add("mz-dragging");
    focus(n);
  }

  function onPointerMove(e: PointerEvent) {
    if (lift) return moveLift(e);
    if (!drag) return;
    const { n } = drag;
    if (tryMove(n, drag.ox + e.clientX - drag.sx, drag.oy + e.clientY - drag.sy)) {
      drag.moved = true;
      render();
    } else {
      blocked(n);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (lift) return dropLift(e);
    if (!drag) return;
    drag.n.el.classList.remove("mz-dragging");
    const moved = drag.moved;
    drag = null;
    unfocus();
    if (moved) {
      syncWorld();
      changed();
      notifySelect();
    }
  }

  function onPointerOver(e: PointerEvent) {
    if (drag || lift) return;
    const n = boxOf(e.target);
    if (n) focus(n);
    else if (!onEdge(e.target)) unfocus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    setLinking(null);
    endLift();
  }

  // ---- 付け替えのドラッグ ----
  // つかんだボックスの半透明のコピー（ゴースト）をポインタに付けて動かし、下にある落とし先を強調する

  function isInside(t: Box, n: Box) {
    for (let m: Box | null = t; m; m = m.parent) if (m === n) return true;
    return false;
  }

  // ポインタの下の落とし先。自分と自分の子孫の上は落とせない（undefined）
  function dropTargetAt(x: number, y: number): Box | null | undefined {
    const r = container.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return undefined;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!container.contains(el)) continue;
      const head = el.closest(".mz-head");
      if (!head) continue;
      const b = boxOf(head);
      if (!b) continue;
      return isInside(b, lift!.n) ? undefined : b;
    }
    return null;
  }

  function markTarget(t: Box | null | undefined) {
    if (!lift) return;
    if (lift.target !== undefined) (lift.target ?? world).el.classList.remove("mz-drop");
    lift.target = t;
    if (t !== undefined) (t ?? world).el.classList.add("mz-drop");
    lift.ghost?.classList.toggle("mz-ghost-no", t === undefined);
  }

  function moveLift(e: PointerEvent) {
    const l = lift!;
    if (!l.ghost) {
      if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 4) return; // クリックとドラッグを見分ける
      const g = l.n.el.cloneNode(true) as HTMLElement;
      g.classList.add("mz-ghost");
      g.classList.remove("mz-current", "mz-dim");
      container.appendChild(g);
      l.ghost = g;
      l.n.el.classList.add("mz-lifted");
      unfocus(); // ポインタを乗せたときの薄い表示を消し、落とし先を見やすくする
    }
    const r = container.getBoundingClientRect();
    l.ghost.style.left = e.clientX - l.offX - r.left + container.scrollLeft + "px";
    l.ghost.style.top = e.clientY - l.offY - r.top + container.scrollTop + "px";
    markTarget(dropTargetAt(e.clientX, e.clientY));
  }

  function endLift() {
    if (!lift) return;
    markTarget(undefined);
    lift.ghost?.remove();
    lift.n.el.classList.remove("mz-lifted");
    lift = null;
  }

  function dropLift(e: PointerEvent) {
    const l = lift!;
    const t = l.ghost ? l.target : undefined;
    // 新しい親の中での位置（ゴーストの左上）
    let at: { x: number; y: number } | undefined;
    if (t !== undefined) {
      const r = (t ?? world).el.getBoundingClientRect();
      at = { x: e.clientX - l.offX - r.left, y: e.clientY - l.offY - r.top };
    }
    const n = l.n;
    endLift();
    if (t !== undefined) reparent(n.id, t ? t.id : null, at);
  }

  const listening = new AbortController();
  const signal = listening.signal;
  container.addEventListener("pointerdown", onPointerDown, { signal });
  container.addEventListener("pointermove", onPointerMove, { signal });
  container.addEventListener("pointerup", onPointerUp, { signal });
  container.addEventListener("pointercancel", onPointerUp, { signal });
  container.addEventListener("pointerover", onPointerOver, { signal });
  container.addEventListener("pointerleave", () => { if (!drag) unfocus(); }, { signal });
  document.addEventListener("keydown", onKeyDown, { signal });

  // ---- 親子の付け替え ----

  // id のボックス（子孫ごと）を parentId の子にする。同じ階層でなくなった線は外す。
  // 位置: 最上位なら at。子を内包しているグループなら、今ある子の下の左端。
  // それ以外（子の無いボックスやツリー、非表示）は自動で並べる
  function reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }) {
    const n = nodeOf(id);
    if (n.isWorld) throw new Error("ワールドは移せません");
    const t = parentId == null ? null : (nodeOf(parentId) as Box);
    if (t && isInside(t, n)) throw new Error("自分や自分の子孫の中には移せません");
    if (n.parent === t) return false;

    const data = api.toJSON();
    const src = data.nodes.find(s => String(s.id) === n.id)!;
    if (t) src.parent = t.src.id;
    else delete src.parent;
    if (t == null && at) {
      src.x = Math.max(0, Math.round(at.x));
      src.y = Math.max(0, Math.round(at.y));
    } else if (t && isNesting(t)) {
      src.x = innerArea(t).left;
      src.y = Math.max(...t.children.map(k => k.y + k.h)) + opt.gap * 2;
    } else {
      delete src.x;
      delete src.y;
    }
    const parentOf = new Map(data.nodes.map(s => [String(s.id), s.parent == null ? null : String(s.parent)]));
    const kept = (data.edges ?? []).filter(e => {
      const { from, to } = e as EdgeData;
      return parentOf.get(String(from)) === parentOf.get(String(to));
    });
    const removed = (data.edges?.length ?? 0) - kept.length;
    data.edges = kept;

    build(data, false);
    select(byId.get(n.id)!);
    changed();
    const where = t ? `「${captionOf(byId.get(t.id)!)}」の中` : "最上位";
    opt.onNotice?.(`${where}へ移しました` + (removed ? `（階層が変わったため、線を ${removed} 本外しました）` : ""));
    return true;
  }

  function setMode(m: Mode) {
    endLift();
    mode = m;
    container.classList.toggle("mz-mode-reparent", m === "reparent");
  }

  // ---- 情報と変更 ----

  function nodeOf(id: Id | null): Container {
    if (id == null) return world;
    const n = byId.get(String(id));
    if (!n) throw new Error(`ボックスがありません: ${id}`);
    return n;
  }

  const brief = (n: Box) => ({ id: n.id, caption: captionOf(n) });

  function info(n: Container | null): Info {
    if (n == null || n.isWorld) {
      return {
        kind: "world", id: null, caption: "ワールド",
        x: 0, y: 0, w: Math.round(world.w), h: Math.round(world.h),
        children: roots.map(brief),
        links: [],
        overflow: overflowOf(world),
        overflows: ["wrap", "clip"],
        background: world.src.background || null,
      };
    }
    const size = sizeOf(n);
    // 中身の扱いを選べるのは、文字を持つボックス（S 以外）か、内包しているボックス
    // スティックマンは文字の置き方が決まっているので使わない
    const usesOverflow = n.children.length ? isNesting(n) : size !== "S" && shapeOf(n) !== "person";
    const out: BoxInfo = {
      kind: n.children.length ? "group" : "box",
      id: n.id,
      caption: captionOf(n),
      color: n.src.color || opt.color,
      fill: fillOf(n),
      border: borderOf(n),
      size,
      shape: shapeOf(n),
      canShape: !isNesting(n),
      childView: viewOf(n),
      treeDirection: treeDirOf(n),
      parent: n.parent ? brief(n.parent) : null,
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      children: n.children.map(brief),
      links: edges.filter(e => e.a === n || e.b === n).map(e => {
        const o = e.a === n ? e.b : e.a;
        return { edgeId: e.id, ...brief(o) };
      }),
      overflow: overflowOf(n),
      overflows: usesOverflow ? [...OVERFLOWS] : [],
    };
    return out;
  }

  // 見せ方を切り替える。内包での子の位置はデータに残し、内包へ戻したときに使う
  function setView(n: Box, view: ChildView) {
    const prev = viewOf(n);
    if (view === prev) return;
    if (prev === "nest") {
      for (const k of n.children) {
        k.src.x = Math.round(k.x);
        k.src.y = Math.round(k.y);
      }
    }
    n.src.childView = view;
    if (view === "nest") {
      for (const k of n.children) {
        k.hasPos = Number.isFinite(k.src.x) && Number.isFinite(k.src.y);
        k.x = Number(k.src.x) || 0;
        k.y = Number(k.src.y) || 0;
      }
    }
  }

  function update(id: Id | null, patch: Patch) {
    const n = nodeOf(id);
    const next = { ...patch };
    checkSettings(next as Record<string, unknown>, n.isWorld ? "world" : n.id);
    if (n.isWorld && next.overflow === "grow") throw new Error("ワールドは伸ばせません");

    if (!n.isWorld) {
      if ("caption" in next) {
        // 空なら id を表示する
        if (next.caption != null && String(next.caption) !== "") n.src.caption = String(next.caption);
        else delete n.src.caption;
      }
      if ("color" in next) {
        // 空なら既定色に戻す
        if (next.color) n.src.color = String(next.color);
        else delete n.src.color;
      }
      if ("fill" in next) n.src.fill = !!next.fill;
      if ("border" in next) n.src.border = !!next.border;
      if (next.size) n.src.size = next.size;
      if (next.shape) {
        if (next.shape === "box") delete n.src.shape; // 既定に戻すときは項目ごと消す
        else n.src.shape = next.shape;
      }
      if (next.childView) setView(n, next.childView);
      if (next.treeDirection) {
        if (next.treeDirection === "down") delete n.src.treeDirection; // 既定に戻すときは項目ごと消す
        else n.src.treeDirection = next.treeDirection;
      }
    }
    if (next.overflow && next.overflow !== overflowOf(n)) {
      if (n.isWorld) {
        n.src.overflow = next.overflow as Exclude<Overflow, "grow">;
      } else {
        // 大きさが固定される方向は、今の大きさを引き継ぐ
        if (overflowOf(n) === "grow") { n.specW = Math.round(n.hw); n.src.width = n.specW; }
        if (next.overflow === "clip") { n.specH = Math.round(n.hh); n.src.height = n.specH; }
        n.src.overflow = next.overflow;
      }
    }
    if (n.isWorld) {
      if ("background" in next) {
        if (next.background) world.src.background = String(next.background);
        else delete world.src.background;
      }
      source.world = world.src;
      syncWorld();
      applyWorldStyle();
    } else {
      applyStyle(n);
    }
    settleAll(n.isWorld ? undefined : n);
    render();
    // 選択中のボックスが非表示になったら、隠した親を選び直す
    if (current && isHidden(current)) select(n.isWorld ? null : n);
    if (linking && isHidden(linking)) setLinking(null);
    changed();
    notifySelect();
  }

  // ---- 読み込み ----

  function clear() {
    for (const n of roots) n.el.remove();
    svg.replaceChildren();
    nodes = [];
    roots = [];
    byId = new Map();
    edges = [];
    drag = null;
    linking = null;
    current?.el.classList.remove("mz-current");
    current = null;
  }

  function buildNode(src: BoxData): Box {
    const el = document.createElement("div");
    el.className = "mz-node";
    const head = document.createElement("div");
    head.className = "mz-head";
    const textEl = document.createElement("div");
    const moreEl = document.createElement("span");
    moreEl.className = "mz-more";
    moreEl.textContent = "▼";
    const shapeSvg = document.createElementNS(SVGNS, "svg");
    shapeSvg.setAttribute("class", "mz-shape");
    shapeSvg.setAttribute("aria-hidden", "true");
    head.append(shapeSvg, textEl, moreEl);
    const treeSvg = document.createElementNS(SVGNS, "svg");
    treeSvg.setAttribute("class", "mz-tree");
    const treePath = document.createElementNS(SVGNS, "path");
    const treeFrame = document.createElementNS(SVGNS, "rect");
    treeFrame.setAttribute("class", "mz-tree-frame");
    treeFrame.setAttribute("x", "0.75");
    treeFrame.setAttribute("y", "0.75");
    treeFrame.setAttribute("rx", "10");
    treeSvg.append(treeFrame, treePath);
    el.append(treeSvg, head);
    const n: Box = {
      isWorld: false,
      src,
      id: String(src.id),
      parent: null,
      children: [],
      specW: Number(src.width) || 0,
      specH: Number(src.height) || 0,
      x: Number(src.x) || 0,
      y: Number(src.y) || 0,
      w: 0, h: 0, hx: 0, hy: 0, hw: 0, hh: 0,
      hasPos: Number.isFinite(src.x) && Number.isFinite(src.y),
      placed: false,
      el, head, textEl, moreEl, shapeSvg, treeSvg, treePath, treeFrame,
    };
    boxOfEl.set(el, n);
    return n;
  }

  function load(newData: unknown, o: { keepHistory?: boolean } = {}) {
    const copy: unknown = newData == null ? newData : JSON.parse(JSON.stringify(newData));
    build(copy, true);
    if (o.keepHistory) record();
    else resetHistory();
  }

  // データを検証して描き直す。fit は読み込み直後のはみ出しの調整をするか
  function build(copy: unknown, fit: boolean) {
    assignIds(copy);
    validate(copy);
    clear();
    source = copy;
    world.src = source.world ?? {};
    syncWorld();
    applyWorldStyle();

    nodes = source.nodes.map(buildNode);
    byId = new Map(nodes.map(n => [n.id, n]));
    for (const n of nodes) {
      n.parent = n.src.parent != null ? byId.get(String(n.src.parent)) ?? null : null;
      if (n.parent) n.parent.children.push(n);
      else roots.push(n);
    }

    // 親子構造に合わせて DOM も入れ子にする（子は本体より手前に来る）
    for (const n of nodes) (n.parent ? n.parent.el : worldEl).appendChild(n.el);
    nodes.forEach(applyStyle);
    worldEl.appendChild(svg); // 線をボックスより手前に

    const raw = (source.edges ?? []).map(normalizeEdge);
    const used = new Set(raw.map(e => e.id).filter(id => id != null).map(String));
    let seq = 1;
    for (const src of raw) {
      if (src.id == null) {
        while (used.has("e" + seq)) seq++;
        src.id = "e" + seq;
        used.add(src.id);
      }
      addEdge(src, byId.get(String(src.from))!, byId.get(String(src.to))!);
    }

    layout(fit);
    render();
    select(null);
  }

  // ワールドの大きさが指定されていなければ、表示領域に合わせて追従する。
  // ここでボックスを動かすと、スクロールバーの出入りで大きさが変わり続けるので動かさない
  const ro = new ResizeObserver(() => {
    if (world.src.width && world.src.height) return;
    syncWorld();
  });
  ro.observe(container);

  const api: Graph = {
    load,
    undo,
    redo,
    history: historyState,
    select(id) { select(id == null ? null : nodeOf(id) as Box); },
    selected: () => (current ? current.id : null),
    info: id => info(id == null ? null : nodeOf(id)),
    update,
    // 現在の状態を返す（元データにある他の項目はそのまま残す）
    toJSON() {
      const out: Diagram = JSON.parse(JSON.stringify(source));
      out.nodes.forEach((src, i) => {
        const n = nodes[i]!;
        // ツリーや非表示の子は自動配置なので、内包のときの位置を残す
        if (!inNest(n)) return;
        src.x = Math.round(n.x);
        src.y = Math.round(n.y);
      });
      out.edges = edges.map(e => ({ ...e.src, id: e.id, from: e.a.src.id!, to: e.b.src.id! }));
      return out;
    },
    dragging: () => drag != null || lift != null,
    setMode,
    mode: () => mode,
    reparent,
    destroy() {
      endLift();
      ro.disconnect();
      listening.abort();
      clear();
      worldEl.remove();
      container.classList.remove("mz-stage");
    },
  };

  load(data);
  return api;
}
