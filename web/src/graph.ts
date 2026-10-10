/*
 * JSON から「線でつながったボックスの図」を描く。
 * - 全体は見えない「ワールド」ボックスの中にあり、ボックスはさらに子を持てる。
 * - 子の見せ方は「内包」（親の中に入れる）「ツリー」（組織図のように下へぶら下げる）「非表示」から選ぶ。
 * - ボックスはドラッグで移動でき、同じ階層のボックス同士は重ならない。
 * - 線は同じ階層（同じ親を持つボックス同士）でだけ引ける。
 * - 線モードでは、Ctrl（Mac は Cmd）+クリックでボックスを2つ選ぶと線が引かれる。
 * - 選択モード（モードの名前は "move"）では、クリックしたボックス（背景ならワールド）か線が選択され、onSelect で知らせる。
 *   ボックスはそのままドラッグで動かせる。線を消すのは removeEdge（サイドバーのボタン）。
 *
 * 使い方:
 *   const graph = createGraph(document.getElementById('stage'), data, { onChange, onSelect });
 *   graph.toJSON();              // 現在の状態を反映したデータ
 *   graph.load(data);            // 別のデータで描き直す（検証エラーなら例外を投げ、表示はそのまま残る）。履歴は空にする
 *   graph.load(data, { keepHistory: true }); // 外部での変更として、履歴に1件足して描き直す（はみ出しの調整はしない。開いたときに移した箱は、位置が変わらなければ移した先のまま）。
 *                                            // ただし、ユーザーがまだ図を変えていなければ（開いてから LLM が整えている間）、履歴に足さず、それを出発点にする
 *   graph.undo(); graph.redo();  // 履歴を戻る・進む（戻したら onChange で知らせる）
 *   graph.select(id);            // 選択する（null はワールド）
 *   graph.reveal(id);            // 見えている範囲の外なら、図をスクロールして真ん中に持ってくる（非表示の親の中なら、見えている祖先）
 *   graph.selectEdge(id);        // 線を選択する（onSelect には線の情報 EdgeInfo が届く）
 *   graph.updateEdge(id, patch); // 線を変更する（caption は空か null で消す、arrow は null で矢印なし、dash は null か "solid" で実線、
 *                                //   route は "straight" / "elbow"。図の既定と同じなら線の側からは消す。via は null で自動に戻す）
 *   graph.alignEdge(id);         // 線の両端を、今の形での一番よい位置に固定する（整列。辺の真ん中か、まっすぐ結べる位置）
 *   graph.removeEdge(id);        // 線を消す
 *   graph.info(id);              // ボックス（null はワールド）の情報
 *   graph.update(id, patch);     // 変更する（caption, color, size, childView, fill, border, overflow）。size は大きさの指定も外す
 *   graph.dragging();            // ドラッグ中か（外部からの変更を、手を離すまで待つのに使う）
 *   graph.setMode(mode);         // ツールのモード: "move"（選択。ドラッグで移動）/ "reparent"（親子の付け替え）/ "link"（線の追加・削除）/ "remove"（削除）
 *   graph.onModeChange(fn);      // モードが変わったら知らせる（一覧から戻したときに移動モードへ切り替えるなど、図の側で変えたときも）
 *   graph.reparent(id, parentId, at); // id を parentId（null は最上位）の子にする。at は最上位へ移すときの位置
 *   graph.fitChildren(id, "width" | "height" | "both"); // 内包している子の大きさを、一番大きい子にそろえる
 *   graph.remove(id);            // 子孫ごと消す（removed へ移す。つながっていた線は捨てる）
 *   graph.restore(id, parentId, at); // 消したボックスを子孫ごと parentId（null は最上位）の子に戻す。at は親の中での位置
 *   graph.items();               // サイドバーの一覧（表示中と、消したもの）
 *   graph.geometry();            // 見えているボックスと線の位置、表示領域の大きさ（配置の要約 report.ts に渡す）
 *   graph.setPage(id);           // 描くページを変える（ページの箱の id。null は最初のページ）。履歴はそのまま
 *   graph.page();                // 描いているページ
 *   graph.pages();               // ブックのページ（ページの箱の id とキャプション）
 *   graph.paste(copy, parentId, at, from); // ほかのブックの箱（pages.ts の copySubtree）を、parentId の子にコピーする（移植）
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
 *       { "id": "e1", "from": 1, "to": 3, "arrow": "end" }   // [1, 3] の形でも読める
 *     ]
 *   }
 *   - world は省略できる。width, height が無ければ、表示領域と置かれているボックスの範囲の大きい方になる。
 *     background で背景色を付けられる（文字や線の色は、背景の明るさに合わせて切り替わる）。
 *     title は図（ブック）の題名で、タブの見出しに使う（無ければファイル名）。ブック全体の world にだけ書く（ページを見ていても）。
 *   - ノードの項目はすべて省略できる。color の既定は白。
 *   - id は連番の数値を使う。省くと読み込み時に、既存の数値 id の続きから連番を振る。
 *   - parent に親ボックスの id を書くと、その子になる。x, y は親の左上からの位置（内包のときに使う）。
 *   - 位置が無いボックスは自動で配置する。
 *   - shape はボックスの形: "box"（既定）/ "person"（スティックマン。キャプションは足元）/ "db"（円柱）。
 *     子を内包しているボックスは枠なので、形は使わない（ツリーや非表示で見せているときは使う）。
 *   - size はボックスの大きさの段階:
 *       "L" … 幅は文字に合わせて 120〜400。越えると折り返す
 *       "M" … 既定。幅は文字に合わせて 120〜240。越えると折り返す
 *       "S" … 小さい文字。幅は 64〜96、高さは固定。10 文字まで（超えると … で切る）
 *     幅の範囲は validate.ts の SIZES で決めている。width を書けば、その幅で折り返す。
 *   - childView は子の見せ方: "nest"（内包、既定）/ "tree"（ツリー）/ "hidden"（非表示、▼ で子がいることを示す）/
 *     "list"（リスト。子を縦に並べて幅をそろえる。子のサイズ・形・子の見せ方は使わず、孫は非表示。docs/LIST-plan.md）
 *     treeDirection はツリーで子を置く向き: "down"（既定）/ "up" / "left" / "right"
 *   - fill: false で塗りつぶし無し（透明）、border で枠線の有無（既定は内包で子を持つボックスだけ枠線あり）。
 *   - overflow は中身（内包の子、または文字）の扱い:
 *       "wrap" … 幅に合わせて折り返す（幅は固定、高さは伸びる）
 *       "grow" … 子に合わせてボックスを伸ばす（子を持つボックスだけ。文字のボックスでは wrap として扱う）
 *       "clip" … ボックスの大きさで切り詰める
 *     既定は子を持つボックスが grow、持たないボックスとワールドが wrap。S サイズでは使わない。
 *     width, height は grow では最小サイズ、wrap では幅、clip では幅と高さになる。
 *     ただし文字のボックスの clip は1行にし、width を幅の上限にする（文字が少なければ縮み、多ければ … で切る）。
 *     文字のボックスで grow を使わないのは、伸ばしたあとで折り返しに戻せなくなるため。
 *   - 線は同じ parent を持つボックス同士（最上位同士を含む）でだけ引ける。
 *     ツリーの子同士の線は描かない（データには残り、内包に戻すと表示される）。
 *   - 線の id が無ければ自動で振る。toJSON() は線を常に { id, from, to } の形で返す。
 *   - arrow は線の矢印: "end"（終点 to の側）/ "start"（始点 from の側）/ "both"。無ければ矢印なし。
 *   - dash は線の模様: "dashed"（破線）。無ければ（"solid"）実線。
 *   - route は線の通り方: "straight"（直線）/ "elbow"（90 度で折れる線）。無ければ world.route（図の既定）、それも無ければ直線。
 *   - exit / enter は折れ線の向きの指定: 始点から出る向き・終点に入る向き。"horizontal"（左右の辺）/ "vertical"（上下の辺）。無ければ自動。
 *     横か縦に並ぶ箱どうしは、両端の向きがそろうときだけ素直に引ける（横に並ぶなら、左右ならまっすぐ、上下ならコの字）。
 *     そろわない指定は斜めのときだけ効き、箱を動かして横か縦に並んだら、指定を両方とも消して自動に戻す。直線には効かない
 *   - exitAt / enterAt は線の両端の位置（割合 0〜1）。直線は相手に向いた側の辺を角から角までたどった割合（横か縦に並ぶなら向いた 1 辺。routing.ts の borderPath）、
 *     折れ線は出入りする辺の上の割合（左右の辺は上から、上下の辺は左から。routing.ts の sidePath）。
 *     選択モードで線を選ぶと両端に丸が出て、ドラッグで辺に沿って動かせる。基準（直線は相手の向き、折れ線は出入りする辺）が変わるか、箱が重なったら消えて自動に戻る
 *   - via は手で直した折れ線の途中の区間の位置の並び（docs/ROUTE-plan.md、routing.ts）。選択モードで途中の区間をドラッグすると、
 *     そのときの形（exit / enter / via）を書き込む。引けるあいだはその形を保ち、引けなくなったら via と向きの指定を消して自動に戻す。
 *     無ければ自動（Z 字の中棒は真ん中か、ほかの箱を避けた位置）。以前の bend（中棒の割合）は、読み込むと via に移す。
 *     ページの既定は、ページの箱の world.route。docs/EDGE-plan.md
 *   - removed は人が消したボックス（nodes と同じ形。parent は消す直前の親）。id は nodes と重ねない。
 *     消したボックスにつながっていた線は残さない（戻しても線は戻らない）。docs/DELETE-plan.md
 *   - page: true のボックスの中身は、別のページ（別のワールド）になる（docs/TABS-plan.md）。ページは入れ子にしない。
 *     ページのワールドの設定は、そのボックスの world に持つ（ファイルの world と同じ形）。
 *
 * ブックとページ（docs/TABS-plan.md 3.2）:
 *   ファイル全体（ブック）のデータを持ち、描くのは 1 ページだけ。描くページの箱だけを Box にするので、
 *   ページの箱の子は親の無い箱（最上位）として、ワールドに並ぶ。配置と描画は、今のページだけを見ている。
 *   ほかのページの箱と線はデータ（source）にそのまま残し、保存のときに書き戻す。
 */

import { GRAPH_CSS, GRAPH_STYLE_ID } from "./graph-style";
import { SVGNS, injectStyle, keyOf } from "./dom";
import { createHistory, type HistoryState } from "./history";
import { createInteraction, type Mode } from "./interaction";
import { createDrag } from "./layout/drag";
import { createLayout } from "./layout/layout";
import { SCENES } from "./layout/policy";
import { type MeasureText, createTextMeasurer } from "./layout/measure";
import {
  type Box, type Container, type Edge, type World,
  absPos, ancestors, arrowOf, inList, borderOf, dashOf, routeDefaultOf, routeOf, viaOf, captionOf, descendants, displayCaption, fillOf, inNest, inTree, isHidden, isNesting, other,
  overflowOf, setOrDelete, setSpec, shapeOf, sizeOf, treeDirOf, viewOf,
} from "./model";
import { type Pos, moveSubtree, pasteSubtree, removeSubtree, restoreSubtree } from "./edits";
import { type Subtree, captionOfData, liveItems, pageMembers, pageNameOf, pageOf, subtreeIds } from "./pages";
import { CAPTION_OFFSET_MAX, createRenderer } from "./render";
import { type RouteFix, alignedEnds, isAligned, route } from "./routing";
import { DEFAULT_THEME, PALETTE, PALETTE_LABELS, isPaletteName, isTheme, themeById, type Theme } from "./theme";
import { createEdgeDrag } from "./edge-drag";
import type { GraphEvent } from "./notices";
import type { GeoEdge, Geometry } from "./report";
import type { Arrow, BoxData, Dash, Route, BoxInfo, ChildView, Diagram, EdgeData, EdgeInfo, Id, Info, Items, NodeInfo, ListItem, Overflow, Patch } from "./types";
import { ARROWS, DASHES, GROUP_MIN, OVERFLOWS, ROUTES, SIZES, assignIds, checkSettings, normalizeEdge, validate } from "./validate";

export const DEFAULTS = {
  color: "#ffffff",
  gap: 8,        // 同じ階層のボックス同士の最小間隔
  padding: 12,   // 内包するボックスの内側の余白
  header: 30,    // 内包するボックスのキャプション欄の高さ
  treeGapX: 24,  // ツリーで横に並ぶ子の間隔
  treeGapY: 40,  // ツリーの親と子の縦の間隔
};

// updateEdge で変えられる線の項目（null で消す）
export interface EdgePatch {
  caption?: string | null; // 空か null で消す
  captionAt?: number | null;     // null で真ん中に戻す
  captionOffset?: number | null; // null で線の上に戻す
  arrow?: Arrow | null;
  dash?: Dash | null;
  route?: Route | null;
  via?: number[] | null;
  exitAt?: number | null;
  enterAt?: number | null;
}

export interface GraphOptions extends Partial<typeof DEFAULTS> {
  onChange?: (data: Diagram) => void;
  onSelect?: (info: Info) => void;
  onHistory?: (state: HistoryState) => void; // 戻れる・進めるかが変わったとき
  onEvent?: (ev: GraphEvent) => void;         // 図で起きたこと（付け替えた、消したなど）。文言と画面の方針は notices.ts
  onBuild?: () => void;                       // 図を組み立て直した（ページの増減やキャプションを見直すため）
  onLiftOver?: (x: number, y: number) => void; // 付け替えのドラッグ中のポインタの位置（画面の座標。タブへのドラッグに使う）
  onLiftEnd?: () => void;                     // 付け替えのドラッグが終わった
  measureText?: MeasureText;                  // 文字の測り方（テストで偽物に差し替える。既定はブラウザで測る）
}

export type { HistoryState, Mode };
export { COPY_MIME, REMOVED_MIME } from "./interaction";

// 履歴に残す件数
const HISTORY_LIMIT = 100;
// 手を離したとき、粘った形が一番よい形よりこれだけ折れ目が多ければ一番よい形に付け替える（docs/EDGE-SPEC.md の問 2）。
// 2 だと、相手の端を動かさずに Z 字で結んだ形（まっすぐより 2 つ多い）まで付け替えてしまう
const SETTLE_BENDS = 3;

export interface Graph {
  load(data: unknown, options?: { keepHistory?: boolean }): void;
  undo(): boolean;
  redo(): boolean;
  history(): HistoryState;
  select(id: Id | null): void;
  reveal(id: Id): void; // 図の見えている範囲の外なら、スクロールして真ん中に持ってくる
  selected(): string | null;
  selectEdge(id: Id): void;
  updateEdge(id: Id, patch: EdgePatch): void;
  alignEdge(id: Id): void; // 線の両端を、今の形での一番よい位置に固定する（整列。docs/EDGE-SPEC.md の C1）
  removeEdge(id: Id): void;
  info(id: Id | null): NodeInfo;
  update(id: Id | null, patch: Patch): void;
  toJSON(): Diagram;
  dragging(): boolean;
  setMode(mode: Mode): void;
  onModeChange(listener: (mode: Mode) => void): () => void; // モードが変わったら知らせる（図の側で変えたときも）。外す関数を返す
  // データが変わったら知らせる（組み立て直したとき: 読み込み・Undo・付け替えなど、と、履歴に残す変更をしたとき）。
  // サイドバーの一覧は、これを受けて図から作り直す（一覧は自分でデータを持たない）。外す関数を返す
  onDataChange(listener: () => void): () => void;
  mode(): Mode;
  reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }): boolean; // at は最上位へ移すときの位置
  fitChildren(id: Id, what: "width" | "height" | "both"): number;
  remove(id: Id): boolean;
  restore(id: Id, parentId: Id | null, at?: { x: number; y: number }): boolean;
  items(): Items;
  geometry(): Geometry;
  setPage(id: Id | null): void;
  page(): string | null;
  pages(): { id: string; caption: string }[];
  paste(copy: Subtree, parentId: Id | null, at?: { x: number; y: number }, from?: string): string;
  // プレビュー（見るだけのモード）。倍率を渡すと入り、null で編集に戻る。プレビュー中は、押すと選ぶだけで、
  // 背景のドラッグは見る範囲を動かす。図を直す操作（ドラッグ、Undo / Redo）は効かない
  setPreview(zoom: number | null): void;
  preview(): number | null;
  contentSize(): { w: number; h: number }; // ボックスが占める範囲（ワールドの左上から、余白込み）
  destroy(): void;
}

export function createGraph(container: HTMLElement, data: unknown, options: GraphOptions = {}): Graph {
  injectStyle(GRAPH_STYLE_ID, GRAPH_CSS);
  const opt = { ...DEFAULTS, ...options };
  container.classList.add("mz-stage", "mz-mode-move"); // 最初は選択モード（setMode と同じ印を付けておく）

  const worldEl = document.createElement("div");
  worldEl.className = "mz-world";
  container.appendChild(worldEl);
  const svg = document.createElementNS(SVGNS, "svg");

  let source: Diagram = { nodes: [] }; // 読み込んだデータ（ブック全体。保存時に未知の項目もそのまま残す）
  let page: string | null = null;      // 描いているページ（ページの箱の id。null は最初のページ）
  let offEdges: EdgeData[] = [];       // ほかのページの線（描かずに残しておく）
  let nodes: Box[] = [];               // データの並び順
  let roots: Box[] = [];
  let byId = new Map<string, Box>();
  let edges: Edge[] = [];
  let linking: Box | null = null;      // Ctrl+クリックで選んだ1つ目
  let mode: Mode = "move";
  let current: Box | null = null;      // 選択中（null はワールド）
  let currentEdge: Edge | null = null; // 選択中の線（選んでいればボックスは選んでいない）
  const boxOfEl = new WeakMap<Element, Box>();
  const edgeOfEl = new WeakMap<Element, Edge>(); // 線の要素（g）から線を引く（途中の区間をつかむ線から、その線を見つける）

  const world: World = {
    isWorld: true, id: null, el: worldEl, x: 0, y: 0, w: 0, h: 0, src: {},
    get children() { return roots; },
  };

  const measurer = createTextMeasurer(options.measureText);
  // 開いたときのはみ出しの調整で移した箱（id → 移したときのファイルの位置と、移した先）。画面にだけある位置なので、
  // 外部の変更の読み直しで、LLM がその箱の位置を変えていなければ移した先に置く（keepShownPositions）。
  // ユーザーが図を変えて保存すると位置はファイルに入るので、忘れる
  let fitted = new Map<string, { file: string; x: number; y: number }>();
  const posKey = (s: { x?: unknown; y?: unknown }) =>
    Number.isFinite(s.x) && Number.isFinite(s.y) ? `${s.x},${s.y}` : null;
  // プレビューの倍率（null は編集中）と、今ワールドにかけている倍率（組み立て直す間は 1 に外す）
  let preview: number | null = null;
  let applied = 1;
  const L = createLayout({
    opt, world, worldEl, container, measurer, roots: () => roots, edges: () => edges, zoom: () => applied,
    fitted: n => {
      const file = posKey(n.src);
      if (file && !fitted.has(n.id)) fitted.set(n.id, { file, x: Math.round(n.x), y: Math.round(n.y) });
    },
  });
  // ドラッグ中か（線の道筋から分かったデータの直しを、手を離すまで待つ）。操作の仕組み（I）を作ったあとで差し替える
  let dragging = () => false;
  const R = createRenderer({ opt, world, worldEl, nodes: () => nodes, edges: () => edges, fixEdge, themeOf, paintOf, backgroundOf }, L);
  const {
    incident, innerArea, syncWorld, clamp, centerX, refitAncestors,
    settle, sizable, alignChildren,
  } = L;
  const { applyWorldStyle, applyStyle, renderEdges, render, blocked, unfocus } = R;
  const H = createHistory({
    snapshot: () => api.toJSON(),
    // 記録した状態に戻す。選択は保ち、読み込み直後のはみ出しの調整はしない（記録どおりに戻すため）
    apply(d) {
      const sel = current?.id ?? null;
      build(d, false);
      if (sel != null && byId.has(sel)) select(byId.get(sel)!);
      fitted.clear();
      opt.onChange?.(api.toJSON());
    },
    onHistory: opt.onHistory,
    limit: HISTORY_LIMIT,
  });
  const I = createInteraction({
    container, world, boxOfEl,
    current: () => current,
    mode: () => mode,
    select,
    cancelLinking: () => setLinking(null),
    ctrlClick,
    changed,
    notifySelect,
    reparent,
    drop: n => { settle(SCENES.drop, n); render(); },
    remove: n => { remove(n.id); },
    boxById: id => byId.get(id),
    edgeOfEl: el => {
      const g = el.closest(".mz-edge");
      return g ? edgeOfEl.get(g) : undefined;
    },
    // 線の区間・端・キャプションのドラッグの中身（edge-drag.ts）
    edgeDrag: createEdgeDrag({
      svg, edges: () => edges, anchorRect: n => L.anchorRect(n), redraw: () => renderEdges(),
      edited: e => { renderEdges(); if (currentEdge === e) notifySelect(); },
      committed: e => { renderEdges(); changed(); if (currentEdge === e) notifySelect(); },
      routeInput: e => R.routeInputOf(e),
    }),
    paste: (copy, parentId, at, from) => { paste(copy, parentId, at, from); },
    liftOver: (x, y) => opt.onLiftOver?.(x, y),
    liftEnd: () => opt.onLiftEnd?.(),
    reorder: (n, index) => { reorder(n, index); },
    // 箱につながる線の、自由な端を前に描いた辺の記憶を捨てる（一番よい形を追わせる）。passive は押し出された箱で、つかんだ箱 grabbed との
    // 線は除く（つかんだ箱の線は粘る。docs/EDGE-SPEC.md の A2・A3・A5）
    resizeBody: n => bodyResizer(n),
    resetRoutes: (boxes, passive = [], grabbed = null) => {
      const set = new Set(boxes), pushed = new Set(passive);
      for (const e of edges) {
        const fresh = set.has(e.a) || set.has(e.b) || ((pushed.has(e.a) || pushed.has(e.b)) && e.a !== grabbed && e.b !== grabbed);
        if (fresh && e.memory) { e.memory = null; e.routeMemo = null; }
      }
    },
    // 手を離した: つかんだ箱の線で、粘った形が一番よい形より折れ目が SETTLE_BENDS 以上多ければ、記憶を捨てて一番よい形にする（A4）
    settleRoutes: n => {
      for (const e of edges) {
        if ((e.a !== n && e.b !== n) || !e.memory || e.a === e.b) continue;
        const best = route({ ...R.routeInputOf(e), memory: null });
        if (e.points.length - 2 - best.bends >= SETTLE_BENDS) { e.memory = null; e.routeMemo = null; }
      }
    },
    // 一覧からドラッグして戻した（選択モードへの切り替えは、知らせを受けた画面の側で決める。notices.ts）
    restore: (id, parentId, at) => { restore(id, parentId, at, true); },
  }, L, R, createDrag(opt, L));
  dragging = () => I.dragging();

  // ユーザーが図を変えたか（読み込んでから、履歴に積む操作をしたか）。変える前の外部の変更は、履歴に積まずに出発点にする
  // （LLM が open のあと check / set で整えている途中を、戻るボタンで巻き戻させないため。docs/HANDOFF.md の 9 章）
  let touched = false;

  // データの変更を知らせる相手（onDataChange）
  const dataListeners = new Set<() => void>();
  const dataChanged = () => { for (const f of dataListeners) f(); };

  function changed() {
    touched = true;
    dataChanged();
    fitted.clear();
    const data = api.toJSON();
    H.record(data);
    opt.onChange?.(data);
  }

  function notifySelect() {
    opt.onSelect?.(currentEdge ? edgeInfo(currentEdge) : info(current));
  }

  // ---- 選択 ----

  // n が図の見えている範囲（スクロールバーを除く）に収まっていなければ、図をスクロールして真ん中に持ってくる。
  // 非表示の親の中にいて描かれていなければ、描かれている一番近い祖先を見せる
  function reveal(n: Box) {
    let m: Box | null = n;
    while (m && !m.el.getClientRects().length) m = m.parent;
    if (!m) return;
    const r = m.el.getBoundingClientRect(), c = container.getBoundingClientRect();
    const left = c.left + container.clientLeft, top = c.top + container.clientTop;
    const right = left + container.clientWidth, bottom = top + container.clientHeight;
    if (r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom) return;
    container.scrollBy({
      left: r.left + r.width / 2 - (left + right) / 2,
      top: r.top + r.height / 2 - (top + bottom) / 2,
      behavior: "smooth",
    });
  }

  function select(n: Box | null) {
    markEdge(null);
    (current ?? world).el.classList.remove("mz-current");
    current = n;
    (current ?? world).el.classList.add("mz-current");
    notifySelect();
  }

  // 線を選ぶ。ボックス（とワールド）の選択は外す
  function selectEdge(e: Edge) {
    (current ?? world).el.classList.remove("mz-current");
    current = null;
    markEdge(e);
    notifySelect();
  }

  function markEdge(e: Edge | null) {
    currentEdge?.el.classList.remove("mz-selected");
    currentEdge = e;
    e?.el.classList.add("mz-selected");
    if (e) R.toFront([e]); // 選んだ線は、重なったほかの線より手前に
  }

  // 線の道筋を決めたときに分かった、データに書き戻すこと（routing.ts の RouteFix）。描画の側ではデータを書き換えない
  // 箱や線をドラッグしている間は書き戻さず、手を離して描き直すときに書く（途中で一瞬引けなくなっただけで消さない。docs/EDGE-SPEC.md の P2）
  function fixEdge(e: Edge, fix: RouteFix) {
    if (dragging()) return;
    if (fix.clearVia) delete e.src.via;
    if (fix.clearLegacy) { delete e.src.exit; delete e.src.enter; delete e.src.bend; }
  }



  function edgeInfo(e: Edge): EdgeInfo {
    return {
      kind: "edge", id: e.id, self: e.a === e.b, from: brief(e.a), to: brief(e.b), arrow: arrowOf(e), dash: dashOf(e), caption: typeof e.src.caption === "string" && e.src.caption ? e.src.caption : null,
      captionMoved: e.src.captionAt != null || e.src.captionOffset != null, route: routeOf(e, world),
      via: viaOf(e), adjustable: e.segments.length > 0, endsMoved: e.src.exitAt != null || e.src.enterAt != null,
      aligned: e.a === e.b || !e.ends || isAligned(R.routeInputOf(e), e.points),
      arrangement: e.arrangement,
    };
  }

  function edgeOf(id: Id) {
    const e = edges.find(x => x.id === String(id));
    if (!e) throw new Error(`線がありません: ${id}`);
    return e;
  }

  function setLinking(n: Box | null) {
    linking?.el.classList.remove("mz-linking");
    linking = n;
    n?.el.classList.add("mz-linking");
  }

  // ---- 線の追加・削除 ----

  function newEdgeId() {
    const used = new Set([...edges.map(e => e.id), ...offEdges.map(e => String(e.id))]);
    let i = edges.length + 1;
    while (used.has("e" + i)) i++;
    return "e" + i;
  }

  // 線の端を吸着させる距離（ワールドの px）





  function canLink(a: Box, b: Box) {
    if (a.parent !== b.parent || inTree(a) || inList(a)) return false;
    // 自分に戻る線は、同じ箱に何本でも引ける（輪の大きさを変えて重ねない。docs/SELFLOOP-plan.md）
    if (a === b) return true;
    return !edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  function addEdge(src: EdgeData, a: Box, b: Box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "mz-edge");
    g.dataset.id = String(src.id); // 外から線を特定するため（線は手前に描き直すと並びが変わるので、順番では探さない）
    const line = document.createElementNS(SVGNS, "polyline");
    line.setAttribute("class", "mz-line");
    const arrowEl = document.createElementNS(SVGNS, "path");
    arrowEl.setAttribute("class", "mz-arrow");
    const hit = document.createElementNS(SVGNS, "polyline");
    hit.setAttribute("class", "mz-hit");
    const handlesEl = document.createElementNS(SVGNS, "g");
    handlesEl.setAttribute("class", "mz-bends");
    const endsEl = document.createElementNS(SVGNS, "g");
    endsEl.setAttribute("class", "mz-ends");
    for (const end of ["exit", "enter"]) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("class", "mz-end");
      c.setAttribute("r", "5");
      c.dataset.end = end;
      endsEl.appendChild(c);
    }
    g.append(line, arrowEl, hit, handlesEl, endsEl);
    svg.appendChild(g);
    const e: Edge = {
      src, id: String(src.id), a, b, el: g, lines: [line, hit], arrowEl, points: [], handlesEl,
      shape: null, segments: [], arrangement: "diagonal", ends: null, memory: null, routeMemo: null, endsEl, labelEl: null,
    };
    // キャプションの札を押しても、線を選ぶ（札は render.ts が作ったり消したりするので、g で受け取る）
    g.addEventListener("click", ev => {
      if (mode !== "move" || !(ev.target instanceof Element) || !ev.target.closest(".mz-label")) return;
      ev.stopPropagation();
      selectEdge(e);
    });
    // ポインタを乗せた線は、重なったほかの線より手前に描く（乗せたときの色が、重なった区間で隠れないように）
    g.addEventListener("pointerenter", () => R.toFront([e]));
    edgeOfEl.set(g, e);
    for (const el of [hit, handlesEl]) {
      el.addEventListener("click", ev => {
        if (mode !== "move") return; // 選択モード以外では、線は CSS でもクリックを受けない
        ev.stopPropagation();
        selectEdge(e);
      });
    }
    edges.push(e);
    return e;
  }

  function removeEdge(e: Edge) {
    e.el.remove();
    edges = edges.filter(x => x !== e);
    if (currentEdge === e) select(null);
    unfocus();
    changed();
    notifySelect();
  }

  function updateEdge(e: Edge, patch: EdgePatch) {
    for (const k of ["exitAt", "enterAt"] as const) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v != null && !(v >= 0 && v <= 1)) throw new Error(`${k} は 0 から 1 の数にしてください: ${v}`);
      setOrDelete(e.src, k, v ?? undefined, v == null);
    }
    if ("via" in patch) {
      if (patch.via != null && !(Array.isArray(patch.via) && patch.via.every(Number.isFinite))) throw new Error("via は数の並びにしてください");
      setOrDelete(e.src, "via", patch.via ?? undefined, patch.via == null);
    }
    if ("route" in patch) {
      if (patch.route != null && !(ROUTES as readonly string[]).includes(patch.route)) throw new Error(`route の値が不正です: ${patch.route}`);
      // 図の既定と同じなら書かない（既定を変えたとき一緒に変わるように）
      setOrDelete(e.src, "route", patch.route ?? undefined, patch.route == null || patch.route === routeDefaultOf(world));
    }
    if ("arrow" in patch) {
      if (patch.arrow != null && !(ARROWS as readonly string[]).includes(patch.arrow)) throw new Error(`arrow の値が不正です: ${patch.arrow}`);
      setOrDelete(e.src, "arrow", patch.arrow ?? undefined, patch.arrow == null);
    }
    if ("captionAt" in patch) {
      const v = patch.captionAt;
      if (v != null && !(v >= 0 && v <= 1)) throw new Error(`captionAt は 0 から 1 の数にしてください: ${v}`);
      setOrDelete(e.src, "captionAt", v ?? undefined, v == null);
    }
    if ("captionOffset" in patch) {
      const v = patch.captionOffset;
      if (v != null && !Number.isFinite(v)) throw new Error(`captionOffset は数にしてください: ${v}`);
      setOrDelete(e.src, "captionOffset", v == null ? undefined : Math.max(-CAPTION_OFFSET_MAX, Math.min(CAPTION_OFFSET_MAX, v)), v == null);
    }
    if ("caption" in patch) {
      const v = patch.caption == null ? "" : String(patch.caption).trim();
      setOrDelete(e.src, "caption", v, !v);
    }
    if ("dash" in patch) {
      if (patch.dash != null && !(DASHES as readonly string[]).includes(patch.dash)) throw new Error(`dash の値が不正です: ${patch.dash}`);
      // 実線は既定なので、JSON には書かない
      setOrDelete(e.src, "dash", patch.dash ?? undefined, patch.dash == null || patch.dash === "solid");
    }
    // 端や形を決め直したら、自由な端の前の辺の記憶は使わない（一番よい形から）
    if ("exitAt" in patch || "enterAt" in patch || "via" in patch || "route" in patch) e.memory = null;
    renderEdges();
    changed();
    notifySelect();
  }

  // 本文の幅をつまんで変える（docs/BODY-plan.md の段階 2）。開始時の位置を覚えておき、幅を変えるたびにそこから決め直す
  // （押しのけた相手は、狭めれば戻る）。手を離したら 1 件の履歴にする
  function bodyResizer(n: Box) {
    const snap = new Map(nodes.map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = typeof n.src.bodyWidth === "number" ? n.src.bodyWidth : undefined;
    const group = L.kindOf(n).name === "nest" || L.kindOf(n).name === "list";
    const width = group ? L.bodyBlock(n)?.w ?? n.hw : n.hw;
    const z = SIZES[sizeOf(n)];
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (w: number | undefined) => {
      restore();
      setOrDelete(n.src, "bodyWidth", w, w == null);
      settle(SCENES.resizeBody, n);
      render();
    };
    return {
      width,
      set(w: number) { apply(Math.round(Math.max(group ? GROUP_MIN.w : z.minW, Math.min(z.maxW, w)))); },
      finish() {
        if (!n.parent) n.intendedCX = centerX(n);
        changed();
        notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // 整列: 両端を、今の形での一番よい位置（辺の真ん中か、まっすぐ結べる位置）に固定し、手で直した区間は消す（docs/EDGE-SPEC.md の C1）
  function alignEdge(e: Edge) {
    if (e.a === e.b || e.points.length < 2 || !e.ends) return;
    updateEdge(e, { ...alignedEnds(R.routeInputOf(e), e.points), via: null });
  }

  function ctrlClick(n: Box) {
    if (!linking) return setLinking(n);
    // 同じ箱を 2 回押したら、自分に戻る線を引く（取り消しは Esc）
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

  // ---- 親子の付け替え ----

  // id のボックス（子孫ごと）を parentId（今のページの箱。null は今のページの最上位）の子にする。同じ階層でなくなった線は外す。
  // id はほかのページの箱でもよい（タブへのドラッグでページを移したとき）。
  // 位置: 最上位なら at。子を内包しているグループなら、今ある子の下の左端。
  // それ以外（子の無いボックスやツリー、非表示）は自動で並べる
  function reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }) {
    const t = target(parentId, "移せません（そのページのタブへ運んでください）");
    const to = parentIdOf(t);
    let cut = 0, fromPage: string | null = null;
    const moved = rebuildWith(data => {
      const src = data.nodes.find(s => String(s.id) === String(id));
      if (!src) throw new Error(`ボックスがありません: ${id}`);
      if (String(src.parent ?? "") === String(to ?? "")) return null;
      // ページは入れ子にしない（ページの箱を、ページの中へは移せない）
      const moving = subtreeIds(data.nodes, id);
      if (page != null && data.nodes.some(s => moving.has(String(s.id)) && s.page === true)) {
        opt.onEvent?.({ kind: "pageInPage" });
        return null;
      }
      fromPage = pageOf(data.nodes, id);
      const pos = t == null && at ? { x: Math.max(0, at.x), y: Math.max(0, at.y) }
        : t && isNesting(t) ? { x: innerArea(t).left, y: Math.max(...t.children.map(k => k.y + k.h)) + opt.gap * 2 }
        : null;
      cut = moveSubtree(data, id, to, pos);
      return { select: String(id) };
    });
    if (!moved) return false;
    opt.onEvent?.({
      kind: "moved", into: t ? keyOfBox(byId.get(t.id)!) : null, page: fromPage !== page ? pageName(page) : null, cutEdges: cut,
    });
    return true;
  }

  const pageName = (p: string | null) => pageNameOf(source.nodes, p);

  // 落とし先（parentId。null は今のページの最上位）の箱。ページの箱の中へは入れられない
  // （中身は別のページにあり、入れると見えなくなるため）。what はそのときの知らせの後半
  function target(parentId: Id | null, what: string): Box | null {
    const t = parentId == null ? null : (nodeOf(parentId) as Box);
    if (t?.src.page === true) throw new Error(`ページの箱の中には${what}`);
    return t;
  }

  // 落とし先の親の id。今のページの最上位なら、ページの中ではページの箱、最初のページでは無し
  const parentIdOf = (t: Box | null) => (t ? t.src.id : pageBox()?.id);

  // 落とした位置に置くか（内包か子の無い箱の中、または最上位）。ツリー・非表示の中なら自動で並べる（null）
  const dropPos = (t: Box | null, at?: { x: number; y: number }) => (at && (!t || viewOf(t) === "nest") ? at : null);

  // 構造が変わる操作（付け替え・ほかのページの箱を消す・戻す・移植）の入口（docs/REFACTOR-2.md）。
  // 図の写しを edit で直して作り直し、選び直して、履歴に 1 件残す。順番（作り直す → 選ぶ → 履歴）はここで決める。
  // edit は、選び直す箱の id（select。無ければワールド）と、落とした操作なら落とした位置（drop。null は位置を決めない）を返す。
  // null を返したら何もしない（作り直さず、履歴にも残さない）。
  // 落とした箱は、落とした位置に置き直し、ぶつかった相手を下へずらし、置いた位置を本来いたい位置にする。
  // 選び直した箱（無ければ null）を返す。値を変える操作（update など）はその場で直すので、ここを通らない。
  // 今のページの箱を消す remove も、押し下げられた箱の本来いたい高さを保つため、その場で外す（作り直すと忘れる）
  function rebuildWith(edit: (data: Diagram) => { select?: string; drop?: Pos } | null): Box | null | undefined {
    const data = api.toJSON();
    const r = edit(data);
    if (!r) return undefined;
    build(data, false);
    const n = r.select != null ? byId.get(r.select) ?? null : null;
    if (n && r.drop !== undefined) {
      if (r.drop) {
        [n.x, n.y] = clamp(n, r.drop.x, r.drop.y);
        settle(SCENES.drop, n);
        render();
      }
      n.intendedY = n.y;
      n.intendedCX = centerX(n);
    }
    select(n);
    changed();
    return n;
  }

  // ---- リストの並べ替え（docs/LIST-plan.md） ----

  // リストの子 n を兄弟の中で index 番目へ移し、並べ直して描く。並び順はデータの並び順（nodes の順）なので、
  // データでも、n を新しい次の兄弟の前（いなければ前の兄弟の後ろ）へ移す。
  // 図の箱（nodes）は今のページの箱だけで、データ（source.nodes）は全ページの箱なので、位置はそれぞれの配列で探す
  function reorder(n: Box, index: number) {
    const kids = n.parent!.children;
    const from = kids.indexOf(n);
    if (from < 0 || from === index) return;
    kids.splice(from, 1);
    kids.splice(index, 0, n);
    const next = kids[index + 1], prev = kids[index - 1];
    const move = <T>(list: T[], item: T, at: (list: T[]) => number) => {
      list.splice(list.indexOf(item), 1);
      list.splice(at(list), 0, item);
    };
    move(nodes, n, l => (next ? l.indexOf(next) : l.indexOf(prev!) + 1));
    move(source.nodes, n.src, l => (next ? l.indexOf(next.src) : l.indexOf(prev!.src) + 1));
    refitAncestors(n);
    render();
  }

  // ---- 削除と復活（docs/DELETE-plan.md） ----

  // n を子孫ごと消す。図は作り直さずにその場で外す（作り直すと、押し下げられた箱が本来いたい高さを忘れる）。
  // 今の位置を書いて removed の末尾へ移し、つながっていた線は捨てる。親は縮み（中身に合わせて伸びる祖先の
  // 大きさの指定は外す）、残った子は動かさない
  function remove(id: Id) {
    if (!byId.has(String(id))) return removeElsewhere(id);
    const n = nodeOf(id);
    if (n.isWorld) throw new Error("ワールドは消せません");
    const gone = new Set([n, ...descendants(n)]);
    // データは今の位置を書いた写しで消し、消したものだけを移す（ほかのページにある子孫、つまりページの箱の中身も一緒に消える）。
    // 残る箱のデータは図の箱が参照しているので、入れ替えずに外すだけにする
    const out = api.toJSON();
    const { ids } = removeSubtree(out, n.id);
    source.removed = out.removed;
    source.nodes = source.nodes.filter(s => !ids.has(String(s.id)));
    offEdges = offEdges.filter(e => !ids.has(String(e.from)) && !ids.has(String(e.to)));
    nodes = nodes.filter(b => !gone.has(b));
    for (const b of gone) byId.delete(b.id);

    const parent = n.parent;
    for (const m of parent ? [parent, ...ancestors(parent)] : []) {
      if (overflowOf(m) !== "grow" || !(m.specW || m.specH)) continue;
      setSpec(m, "w", 0);
      setSpec(m, "h", 0);
    }
    if (parent) parent.children.splice(parent.children.indexOf(n), 1);
    else roots.splice(roots.indexOf(n), 1);
    n.el.remove();
    const cut = edges.filter(e => gone.has(e.a) || gone.has(e.b));
    for (const e of cut) e.el.remove();
    edges = edges.filter(e => !cut.includes(e));

    // 選んでいた箱や線が消えたら、ワールドを選び直す（消えた線の情報をサイドバーへ送らないように）
    if ((current && gone.has(current)) || (currentEdge && cut.includes(currentEdge))) select(null);
    if (linking && gone.has(linking)) setLinking(null);
    unfocus();
    settle(SCENES.remove, parent ?? undefined);
    render();
    changed();
    notifySelect();
    opt.onEvent?.({ kind: "removed", key: keyOfBox(n), kids: gone.size - 1, cutEdges: cut.length });
    return true;
  }

  // ほかのページの箱を子孫ごと消す（一覧の × から）。描いていないので、データだけを直して組み立て直す。
  // 今描いているページの箱そのものを消したら、最初のページに戻る
  function removeElsewhere(id: Id) {
    const s = source.nodes.find(x => String(x.id) === String(id));
    if (!s) throw new Error(`ボックスがありません: ${id}`);
    let gone = 0, cut = 0;
    rebuildWith(data => {
      const r = removeSubtree(data, id);
      if (page != null && r.ids.has(page)) page = null;
      [gone, cut] = [r.ids.size, r.cut];
      return {};
    });
    opt.onEvent?.({ kind: "removed", key: keyOf(s.id, captionOfData(s)), kids: gone - 1, cutEdges: cut });
    return true;
  }

  // 消したボックス id を、removed の中の子孫ごと parentId（null は最上位）の子に戻す。付け替えと同じく作り直す。
  // 位置: 内包（か子の無いボックス）の中や最上位なら at（親の中での位置）。ツリー・非表示の中なら自動で並べる。
  // at に置いてぶつかった相手は、ドラッグで手を離したときと同じく下へずらす。線は戻さない
  function restore(id: Id, parentId: Id | null, at?: { x: number; y: number }, byDrag = false) {
    const t = target(parentId, "戻せません（そのページのタブで戻してください）");
    const pos = dropPos(t, at);
    const n = rebuildWith(data => {
      restoreSubtree(data, id, parentIdOf(t), pos);
      return { select: String(id), drop: pos };
    })!;
    opt.onEvent?.({ kind: "restored", key: keyOfBox(n), byDrag });
    return true;
  }

  // ほかのブックの箱を子孫ごと、parentId（null は今のページの最上位）の子にコピーする（移植。docs/TABS-plan.md 4.3）。
  // id はこのブックで空いている番号に振り直し、線は写した箱どうしのものだけ持ってくる（線の id も振り直す）。
  // ページの中へ落としたら、ページは入れ子にしないので、写した箱の page を外す。位置の扱いは復活と同じ。
  // 写した箱の新しい id を返す
  function paste(copy: Subtree, parentId: Id | null, at?: { x: number; y: number }, from?: string) {
    const t = target(parentId, "移植できません（そのページのタブで落としてください）");
    const pos = dropPos(t, at);
    let r!: ReturnType<typeof pasteSubtree>;
    const n = rebuildWith(data => {
      r = pasteSubtree(data, copy, parentIdOf(t), pos, page != null);
      return { select: r.root, drop: pos };
    })!;
    opt.onEvent?.({ kind: "pasted", key: keyOfBox(n), from: from ?? null, kids: r.nodes - 1, edges: r.edges });
    return r.root;
  }

  // サイドバーの一覧（ブック全体）。表示中の箱は、載っているページを添える（ページの箱の直下の子は、親を出さない）。
  // 消したボックスの親は、表示中か消したものの中から名前を引く
  function items(): Items {
    const item = (id: Id, caption: string, color: unknown, parent: string | null, p: string | null = null): ListItem =>
      ({ id: String(id), caption, color: typeof color === "string" && color ? color : opt.color, parent, page: p });
    const removed = source.removed ?? [];
    const removedCaption = new Map(removed.map(s => [String(s.id), s.caption != null ? String(s.caption) : String(s.id)]));
    const nameOf = (p: Id | undefined) => {
      if (p == null) return null;
      const live = byId.get(String(p));
      return live ? captionOf(live) : removedCaption.get(String(p)) ?? null;
    };
    return {
      ...liveItems(source.nodes, page, opt.color),
      removed: removed.map(s => item(s.id!, removedCaption.get(String(s.id))!, s.color, nameOf(s.parent))),
    };
  }

  // 内包している子の幅や高さを、今いちばん小さい子に合わせてそろえる（layout/layout.ts の alignChildren）。
  // そろえた子の数を返す
  function fitChildren(id: Id, what: "width" | "height" | "both") {
    const n = nodeOf(id);
    if (n.isWorld) throw new Error("ワールドの子はそろえられません");
    if (sizable(n).length < 2) return 0;
    let result = { count: 0, partial: false };
    settle(SCENES.fitChildren, n, () => { result = alignChildren(n, what, SCENES.fitChildren); });
    const { count, partial } = result;
    render();
    changed();
    notifySelect();
    opt.onEvent?.({ kind: "aligned", count, what, partial });
    return count;
  }

  function setMode(m: Mode) {
    I.endLift();
    I.unmarkRemove();
    if (m !== "link") setLinking(null);
    mode = m;
    container.classList.toggle("mz-mode-move", m === "move");
    container.classList.toggle("mz-mode-reparent", m === "reparent");
    container.classList.toggle("mz-mode-link", m === "link");
    container.classList.toggle("mz-mode-remove", m === "remove");
    for (const f of modeListeners) f(m);
  }
  const modeListeners = new Set<(m: Mode) => void>();

  // ---- 情報と変更 ----

  function nodeOf(id: Id | null): Container {
    if (id == null) return world;
    const n = byId.get(String(id));
    if (!n) throw new Error(`ボックスがありません: ${id}`);
    return n;
  }

  // ---- テーマ（theme.ts、docs/THEME-plan.md） ----

  // 箱（null はワールド）に効いているテーマ。近い祖先から順にたどって最初に書かれたもの。無ければ描いているワールド、
  // ページならブック全体のワールド、それも無ければ default
  function themeOf(n: Box | null): Theme {
    for (let b: Box | null = n; b; b = b.parent) if (isTheme(b.src.theme)) return themeById(b.src.theme);
    if (isTheme(world.src.theme)) return themeById(world.src.theme);
    if (page != null && isTheme(source.world?.theme)) return themeById(source.world!.theme);
    return themeById(DEFAULT_THEME);
  }

  // 箱を塗る色と、それがデータの color から来たか（own）。color はテーマの上の上書き（theme.ts の冒頭、THEME-plan 11 章）:
  // 色の名前はそのテーマの色、色の値はその色、無ければテーマの既定の色
  function paintOf(n: Box): { color: string; own: boolean } {
    const t = themeOf(n);
    const c = n.src.color;
    if (isPaletteName(c)) return { color: t.palette[c], own: true };
    if (c) return { color: c, own: true };
    if (t.id === DEFAULT_THEME) return { color: opt.color, own: false };
    return { color: isNesting(n) ? t.group ?? t.box : t.box, own: false };
  }

  // 実際の背景の色。world.background はテーマの上の上書き。無ければテーマの背景
  function backgroundOf(): string | null {
    return world.src.background || themeOf(null).background || null;
  }

  // 書いてあるが知らないテーマの名前（無ければ null）
  const unknownTheme = (v: unknown) => (v != null && v !== "" && !isTheme(v) ? String(v) : null);

  // データ全体（ブック）にある、知らないテーマの名前。読み込んだときに知らせる
  function unknownThemes(): string[] {
    const found = new Set<string>();
    const add = (v: unknown) => { const u = unknownTheme(v); if (u) found.add(u); };
    add(source.world?.theme);
    for (const s of source.nodes) { add(s.theme); add(s.world?.theme); }
    return [...found];
  }

  const brief = (n: Box) => ({ id: n.id, caption: captionOf(n) });
  // 知らせに出す短いキー（長いキャプションでヘッダーが崩れないように）
  const keyOfBox = (n: Box) => keyOf(n.src.id, captionOf(n));

  function info(n: Container | null): NodeInfo {
    if (n == null || n.isWorld) {
      return {
        kind: "world", id: null, caption: "ワールド",
        x: 0, y: 0, w: Math.round(world.w), h: Math.round(world.h),
        children: roots.map(brief),
        links: [],
        overflow: overflowOf(world),
        overflows: ["wrap", "clip"],
        background: world.src.background || null,
        backgroundPaint: backgroundOf(),
        theme: isTheme(world.src.theme) ? world.src.theme : null,
        themeUnknown: unknownTheme(world.src.theme),
        themeUsed: themeOf(null).id,
        route: routeDefaultOf(world),
        title: typeof source.world?.title === "string" && source.world.title ? source.world.title : null,
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
      color: n.src.color ?? "",
      theme: isTheme(n.src.theme) ? n.src.theme : null,
      themeUnknown: unknownTheme(n.src.theme),
      themeUsed: themeOf(n).id,
      paint: paintOf(n).color,
      palette: PALETTE.map(name => ({ name, label: PALETTE_LABELS[name], color: themeOf(n).palette[name] })),
      fill: fillOf(n),
      border: borderOf(n),
      size,
      shape: shapeOf(n),
      canShape: !isNesting(n) && !inList(n) && n.src.page !== true,
      body: typeof n.src.body === "string" ? n.src.body : "",
      inList: inList(n),
      sizableChildren: sizable(n).length,
      childView: viewOf(n),
      treeDirection: treeDirOf(n),
      parent: n.parent ? brief(n.parent) : null,
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      children: n.children.map(brief),
      links: incident(n).map(e => ({ edgeId: e.id, ...brief(other(e, n)) })),
      overflow: overflowOf(n),
      overflows: !usesOverflow ? [] : n.children.length ? [...OVERFLOWS] : ["wrap", "clip"],
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
        k.intendedY = k.y;
      }
    }
  }

  function update(id: Id | null, patch: Patch) {
    const n = nodeOf(id);
    const next = { ...patch };
    checkSettings(next as Record<string, unknown>, n.isWorld ? "world" : n.id);
    if (n.isWorld && next.overflow === "grow") throw new Error("ワールドは伸ばせません");
    if (!n.isWorld && !n.children.length && next.overflow === "grow") throw new Error("文字のボックスは伸ばせません");

    // 大きさや見せ方が変わっても、線の角度と長さが変わらないよう位置を保つ（設定変更の場面）。
    // settle が保つ位置を覚えてから apply を呼ぶ
    const apply = () => {
      if (!n.isWorld) {
        // キャプションが空なら空の箱にし、色が空なら既定色に戻す
        if ("caption" in next) {
          setOrDelete(n.src, "caption", String(next.caption ?? ""), next.caption == null || String(next.caption) === "");
        }
        if ("body" in next) setOrDelete(n.src, "body", String(next.body ?? ""), !next.body);
        if ("bodyWidth" in next) {
          const v = next.bodyWidth; // 値の誤りは checkSettings で断っている
          setOrDelete(n.src, "bodyWidth", v == null ? undefined : Math.round(v), v == null);
        }
        if ("color" in next) setOrDelete(n.src, "color", String(next.color ?? ""), !next.color);
        if ("theme" in next) setOrDelete(n.src, "theme", String(next.theme ?? ""), !next.theme);
        if ("fill" in next) n.src.fill = !!next.fill;
        if ("border" in next) n.src.border = !!next.border;
        if (next.size) {
          // サイズを選んだら、そのサイズで中身に合わせた大きさに戻す（付いていた大きさの指定を外す）
          n.src.size = next.size;
          setSpec(n, "w", 0);
          setSpec(n, "h", 0);
        }
        if (next.shape) setOrDelete(n.src, "shape", next.shape, next.shape === "box");
        if (next.childView) setView(n, next.childView);
        if (next.treeDirection) setOrDelete(n.src, "treeDirection", next.treeDirection, next.treeDirection === "down");
      }
      if (next.overflow && next.overflow !== overflowOf(n)) {
        if (n.isWorld) {
          n.src.overflow = next.overflow as Exclude<Overflow, "grow">;
        } else {
          // 文字のボックスを折り返すに戻したら、切り詰めるときに固定した大きさを外して中身に合わせる
          if (!n.children.length && next.overflow === "wrap") {
            setSpec(n, "w", 0);
            setSpec(n, "h", 0);
          }
          // 大きさが固定される方向は、今の大きさを引き継ぐ
          if (overflowOf(n) === "grow") setSpec(n, "w", Math.round(n.hw));
          if (next.overflow === "clip") {
            // 今の幅を上限にする。文字のボックスは1行になるので高さは決めず、グループは今の高さで切る
            if (!n.specW) setSpec(n, "w", Math.round(n.hw));
            if (n.children.length) setSpec(n, "h", Math.round(n.hh));
          }
          n.src.overflow = next.overflow;
        }
      }
      if (n.isWorld) {
        if ("title" in next) {
          // 題名はブック全体のもの。ページを見ていても、ブック全体の world に書く
          const title = String(next.title ?? "").trim();
          const top = pageBox() ? (source.world ??= {}) : world.src;
          setOrDelete(top, "title", title, !title);
          if (pageBox() && !Object.keys(top).length) delete source.world;
        }
        if ("background" in next) setOrDelete(world.src, "background", String(next.background ?? ""), !next.background);
        if ("theme" in next) setOrDelete(world.src, "theme", String(next.theme ?? ""), !next.theme);
        if ("route" in next) {
          if (next.route != null && !(ROUTES as readonly string[]).includes(next.route)) throw new Error(`route の値が不正です: ${next.route}`);
          setOrDelete(world.src, "route", next.route ?? undefined, next.route == null || next.route === "straight");
        }
        storeWorld();
        syncWorld();
        applyWorldStyle();
        // テーマは全部の箱に効く（書いていない箱は受け継ぐ）
        if ("theme" in next) nodes.forEach(applyStyle);
      } else {
        applyStyle(n);
        // テーマは子孫も受け継ぐ
        if ("theme" in next) descendants(n).forEach(applyStyle);
      }
    };
    settle(SCENES.settings, n.isWorld ? undefined : n, apply);
    render();
    // 選択中のボックスが非表示になったら、隠した親を選び直す
    if (current && isHidden(current)) select(n.isWorld ? null : n);
    if (linking && isHidden(linking)) setLinking(null);
    changed();
    notifySelect();
  }

  // ---- ページ ----

  // 描いているページの箱のデータ（最初のページなら null）
  const pageBox = () => (page == null ? null : source.nodes.find(s => String(s.id) === page) ?? null);

  // ワールドの設定を、今のページの持ち主（ファイルかページの箱）へ書き戻す。空なら項目ごと消す
  function storeWorld() {
    const box = pageBox();
    const empty = !Object.keys(world.src).length;
    if (box) {
      if (empty) delete box.world;
      else box.world = world.src;
    } else {
      source.world = world.src;
    }
  }

  // ---- 読み込み ----

  function clear() {
    for (const n of roots) n.el.remove();
    svg.replaceChildren();
    nodes = [];
    roots = [];
    byId = new Map();
    edges = [];
    I.reset();
    linking = null;
    currentEdge = null;
    current?.el.classList.remove("mz-current");
    current = null;
  }

  function buildNode(src: BoxData): Box {
    const el = document.createElement("div");
    el.className = "mz-node";
    el.dataset.id = String(src.id); // 外から箱を特定するため（実際のブラウザのテストなど）
    const head = document.createElement("div");
    head.className = "mz-head";
    const textEl = document.createElement("div");
    const moreEl = document.createElement("span");
    moreEl.className = "mz-more";
    moreEl.textContent = "▼";
    const shapeSvg = document.createElementNS(SVGNS, "svg");
    shapeSvg.setAttribute("class", "mz-shape");
    shapeSvg.setAttribute("aria-hidden", "true");
    const bodyEl = document.createElement("div");
    bodyEl.className = "mz-body";
    bodyEl.hidden = true;
    const gripEl = document.createElement("div");
    gripEl.className = "mz-body-grip";
    gripEl.title = "ドラッグで本文の幅を変える";
    gripEl.hidden = true;
    head.append(shapeSvg, textEl, bodyEl, gripEl, moreEl);
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
      intendedY: Number(src.y) || 0,
      intendedCX: NaN,
      capW: 0,
      listW: 0,
      el, head, textEl, bodyEl, gripEl, moreEl, shapeSvg, treeSvg, treePath, treeFrame,
    };
    boxOfEl.set(el, n);
    return n;
  }

  // 読み込み直後のはみ出しの調整（fitToViewport）は、最初に開いたときだけ行う。
  // 外部（LLM など）の変更の読み直しでは行わない。行うと、ファイルの位置と画面の位置がずれていくため
  function load(newData: unknown, o: { keepHistory?: boolean } = {}) {
    const copy: unknown = newData == null ? newData : JSON.parse(JSON.stringify(newData));
    if (o.keepHistory) keepShownPositions(copy);
    else fitted = new Map();
    // 外部の変更の読み直しでは、選んでいる箱や線を保つ（残っていれば。Undo と同じ）。LLM が図を書き換えるたびに
    // 選択が外れると、サイドバーで入力中の内容も消えてしまうため（docs/REVIEW-2026-10-09.md の B10）
    const keep = o.keepHistory ? { box: current?.id ?? null, edge: currentEdge?.id ?? null } : undefined;
    build(copy, !o.keepHistory, keep);
    const unknown = unknownThemes();
    if (unknown.length) opt.onEvent?.({ kind: "unknownTheme", names: unknown });
    if (!o.keepHistory) touched = false;
    if (o.keepHistory && touched) H.record();
    else H.reset();
  }

  // 外部の変更を読み直すとき、画面にだけある位置（保存されない）を使う。使わないと読み直すたびに動いてしまう。
  // - 開いたときのはみ出しの調整（fitToViewport）で移した箱は、ファイルの位置が移したときのままなら、移した先に置く
  //   （ユーザーが触る前に LLM が set すると、関係の無い箱がデータの位置へ飛んでいた。docs/DIST-TRIAL.md。2026-10-10 ユーザー）。
  //   今の位置ではなく移した先にするのは、そのあと押し下げられた分（データから計算し直せる）まで残さないため
  // - 位置の無い箱は、直前まで同じ親の中に描いていた位置（LLM が位置を書かずに箱を足したとき、見ている配置が変わらないように。2026-10-03 ユーザー）。
  //   自由に置ける箱（最上位と内包の子）だけ。ツリーの子の位置は自動なので使わない（使うと内包に戻したときの位置になってしまう）
  function keepShownPositions(data: unknown) {
    if (!data || typeof data !== "object" || !Array.isArray((data as Diagram).nodes)) return;
    const shown = new Map(nodes.filter(n => inNest(n)).map(n => [n.id, n]));
    for (const s of (data as Diagram).nodes) {
      if (!s || typeof s !== "object" || s.id == null) continue;
      const k = posKey(s);
      if (k) {
        const f = fitted.get(String(s.id));
        if (!f) continue;
        if (f.file !== k || (s.parent == null ? null : String(s.parent)) !== page) { fitted.delete(String(s.id)); continue; }
        s.x = f.x;
        s.y = f.y;
        continue;
      }
      const n = shown.get(String(s.id));
      // ページを描いているときは、ページの箱の子が最上位に並ぶ（描いている親は null だが、データの親はページの箱）
      if (!n || (n.parent?.id ?? page) !== (s.parent == null ? null : String(s.parent))) continue;
      s.x = Math.round(n.x);
      s.y = Math.round(n.y);
    }
  }

  // データを検証して描き直す。fit は読み込み直後のはみ出しの調整をするか
  // keep は組み立て直したあとに選び直す箱か線の id（残っていれば。無ければワールドを選ぶ）。途中でワールドを選ばずに
  // 直接選ぶ（いったんワールドを選ぶと、サイドバーの情報タブが切り替わって、入力中の内容が消えるため）
  function build(copy: unknown, fit: boolean, keep?: { box: string | null; edge: string | null }) {
    unzoomed(() => buildAll(copy, fit, keep));
  }

  // ---- プレビュー ----

  function applyZoom(z: number) {
    applied = z;
    worldEl.style.zoom = z === 1 ? "" : String(z);
    syncWorld();
  }

  // 倍率を外して fn を動かす。文字の幅は画面で測るので、倍率がかかったまま組み立て直すと誤る
  // （プレビュー中に外部の変更を読み直すとき、ページを切り替えるとき）
  function unzoomed(fn: () => void) {
    if (preview == null) return fn();
    applyZoom(1);
    try {
      fn();
    } finally {
      applyZoom(preview);
    }
  }

  function setPreview(z: number | null) {
    preview = z;
    container.classList.toggle("mz-preview", z != null);
    applyZoom(z ?? 1);
  }

  // プレビュー中の押下。図の操作（interaction.ts）より先に受け取り、選ぶだけにする。
  // 背景を押したらワールドを選び、そのままドラッグすると見る範囲を動かす
  container.addEventListener("pointerdown", e => {
    if (preview == null) return;
    e.stopImmediatePropagation();
    const t = e.target instanceof Element ? e.target : null;
    const edgeEl = t?.closest(".mz-edge");
    const edge = edgeEl ? edgeOfEl.get(edgeEl) : undefined;
    if (edge) return selectEdge(edge);
    const nodeEl = t?.closest(".mz-node");
    const n = nodeEl ? boxOfEl.get(nodeEl) : undefined;
    if (n) return select(n);
    select(null);
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop };
    const stop = new AbortController();
    container.classList.add("mz-panning");
    document.addEventListener("pointermove", ev => {
      container.scrollLeft = start.left - (ev.clientX - start.x);
      container.scrollTop = start.top - (ev.clientY - start.y);
    }, { signal: stop.signal });
    const end = () => { stop.abort(); container.classList.remove("mz-panning"); };
    document.addEventListener("pointerup", end, { signal: stop.signal });
    document.addEventListener("pointercancel", end, { signal: stop.signal });
  }, true);

  function buildAll(copy: unknown, fit: boolean, keep?: { box: string | null; edge: string | null }) {
    assignIds(copy);
    validate(copy);
    clear();
    source = copy;
    // 描いていたページが無くなっていたら（Undo や外部の変更で）、最初のページに戻る
    if (page != null && !source.nodes.some(s => String(s.id) === page && s.page === true)) page = null;
    const pageSrc = pageBox();
    world.src = (pageSrc ? pageSrc.world : source.world) ?? {};
    syncWorld();
    applyWorldStyle();

    const shown = new Set(pageMembers(source.nodes, page));
    nodes = source.nodes.filter(s => shown.has(String(s.id))).map(buildNode);
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
    offEdges = [];
    for (const src of raw) {
      if (src.id == null) {
        while (used.has("e" + seq)) seq++;
        src.id = "e" + seq;
        used.add(src.id);
      }
      // 線は同じ親どうしなので、両端とも今のページにあるか、両端ともほかのページにある
      const a = byId.get(String(src.from)), b = byId.get(String(src.to));
      if (a && b) addEdge(src, a, b);
      else offEdges.push(src);
    }
    source.edges = raw;

    settle(fit ? SCENES.open : SCENES.reload);
    render();
    const keptEdge = keep?.edge != null ? edges.find(e => e.id === keep.edge) : undefined;
    if (keep?.box != null && byId.has(keep.box)) select(byId.get(keep.box)!);
    else if (keptEdge) selectEdge(keptEdge);
    else select(null);
    opt.onBuild?.();
    dataChanged();
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
    undo: () => preview == null && H.undo(),
    redo: () => preview == null && H.redo(),
    history: () => H.state(),
    select(id) { select(id == null ? null : nodeOf(id) as Box); },
    reveal(id) { const n = nodeOf(id); if (!n.isWorld) reveal(n); },
    selected: () => (current ? current.id : null),
    selectEdge: id => selectEdge(edgeOf(id)),
    updateEdge: (id, patch) => updateEdge(edgeOf(id), patch),
    alignEdge: id => alignEdge(edgeOf(id)),
    removeEdge: id => removeEdge(edgeOf(id)),
    info: id => info(id == null ? null : nodeOf(id)),
    update,
    // 現在の状態を返す（元データにある他の項目はそのまま残す）
    toJSON() {
      const out: Diagram = JSON.parse(JSON.stringify(source));
      for (const src of out.nodes) {
        const n = byId.get(String(src.id));
        // ほかのページの箱はそのまま。ツリーや非表示の子は自動配置なので、内包のときの位置を残す
        if (!n || !inNest(n)) continue;
        src.x = Math.round(n.x);
        src.y = Math.round(n.y);
      }
      // 線は読み込んだときの並びを保ち、ほかのページの線はそのまま残す。消した線は外し、足した線は後ろに付ける
      const drawn = new Map(edges.map(e => [e.id, { ...e.src, id: e.id, from: e.a.src.id!, to: e.b.src.id! }]));
      const off = new Set(offEdges);
      const list: EdgeData[] = [];
      for (const e of (source.edges ?? []) as EdgeData[]) {
        if (off.has(e)) list.push(JSON.parse(JSON.stringify(e)));
        else if (drawn.has(String(e.id))) { list.push(drawn.get(String(e.id))!); drawn.delete(String(e.id)); }
      }
      out.edges = [...list, ...drawn.values()];
      return out;
    },
    dragging: () => I.dragging(),
    setMode,
    onDataChange(f) {
      dataListeners.add(f);
      return () => dataListeners.delete(f);
    },
    onModeChange(f) {
      modeListeners.add(f);
      return () => modeListeners.delete(f);
    },
    mode: () => mode,
    reparent,
    fitChildren,
    remove,
    restore,
    items,
    setPage(id) {
      const next = id == null ? null : String(id);
      if (next === page) return;
      if (next != null && !source.nodes.some(s => String(s.id) === next && s.page === true)) {
        throw new Error(`ページの箱ではありません: ${id}`);
      }
      const data = api.toJSON();
      page = next;
      build(data, true);
      notifySelect();
    },
    page: () => page,
    paste,
    pages: () => source.nodes.filter(s => s.page === true)
      .map(s => ({ id: String(s.id), caption: s.caption != null && s.caption !== "" ? String(s.caption) : String(s.id) })),
    geometry() {
      const boxes = nodes.filter(n => !isHidden(n)).map(n => {
        const [x, y] = absPos(n);
        return {
          id: n.id, caption: captionOf(n), ancestors: ancestors(n).map(p => p.id),
          x, y, w: n.w, h: n.h, cut: displayCaption(n) !== captionOf(n), color: paintOf(n).color,
          ...(n.children.length ? { view: viewOf(n), kids: n.children.length } : {}),
        };
      });
      // 線の点の並びは、矢印の分を縮める前のもの（見える線は、矢印のある端で短くしている）
      const shown = edges.filter(e => e.el.style.display !== "none");
      return {
        viewport: L.viewport(),
        boxes,
        edges: shown.map(e => {
          const out: GeoEdge = { id: e.id, a: e.a.id, b: e.b.id, points: e.points.map(p => [...p] as [number, number]) };
          // キャプションの札の範囲（ワールドの座標）。描かれていて大きさが分かるときだけ
          const text = e.labelEl?.querySelector("span");
          if (text && typeof e.src.caption === "string") {
            const sr = text.getBoundingClientRect(), wr = worldEl.getBoundingClientRect();
            out.caption = e.src.caption;
            if (sr.width) out.label = { x: sr.left - wr.left, y: sr.top - wr.top, w: sr.width, h: sr.height };
          }
          return out;
        }),
      };
    },
    setPreview,
    preview: () => preview,
    contentSize() {
      let w = 0, h = 0;
      for (const r of roots) {
        w = Math.max(w, r.x + r.w + opt.padding);
        h = Math.max(h, r.y + r.h + opt.padding);
      }
      return { w, h };
    },
    destroy() {
      measurer.dispose();
      I.endLift();
      ro.disconnect();
      I.destroy();
      clear();
      worldEl.remove();
      container.classList.remove("mz-stage");
    },
  };

  load(data);
  return api;
}
