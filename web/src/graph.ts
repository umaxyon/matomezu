/*
 * JSON から「線でつながったボックスの図」を描く。
 * - 全体は見えない「ワールド」ボックスの中にあり、ボックスはさらに子を持てる。
 * - 子の見せ方は「内包」（親の中に入れる）「ツリー」（組織図のように下へぶら下げる）「非表示」から選ぶ。
 * - ボックスはドラッグで移動でき、同じ階層のボックス同士は重ならない。
 * - 線は同じ階層（同じ親を持つボックス同士）でだけ引ける。
 * - 線モードでは、線をクリックすると消え、Ctrl（Mac は Cmd）+クリックでボックスを2つ選ぶと線が引かれる。
 * - クリックしたボックス（背景ならワールド）が選択され、onSelect で知らせる。
 *
 * 使い方:
 *   const graph = createGraph(document.getElementById('stage'), data, { onChange, onSelect });
 *   graph.toJSON();              // 現在の状態を反映したデータ
 *   graph.load(data);            // 別のデータで描き直す（検証エラーなら例外を投げ、表示はそのまま残る）。履歴は空にする
 *   graph.load(data, { keepHistory: true }); // 外部での変更として、履歴に1件足して描き直す（はみ出しの調整はしない）
 *   graph.undo(); graph.redo();  // 履歴を戻る・進む（戻したら onChange で知らせる）
 *   graph.select(id);            // 選択する（null はワールド）
 *   graph.info(id);              // ボックス（null はワールド）の情報
 *   graph.update(id, patch);     // 変更する（caption, color, size, childView, fill, border, overflow）。size は大きさの指定も外す
 *   graph.dragging();            // ドラッグ中か（外部からの変更を、手を離すまで待つのに使う）
 *   graph.setMode(mode);         // ツールのモード: "move"（移動）/ "reparent"（親子の付け替え）/ "link"（線の追加・削除）/ "remove"（削除）
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
 *       "L" … 幅は文字に合わせて 120〜400。越えると折り返す
 *       "M" … 既定。幅は文字に合わせて 120〜240。越えると折り返す
 *       "S" … 小さい文字。幅は 64〜96、高さは固定。10 文字まで（超えると … で切る）
 *     幅の範囲は validate.ts の SIZES で決めている。width を書けば、その幅で折り返す。
 *   - childView は子の見せ方: "nest"（内包、既定）/ "tree"（ツリー）/ "hidden"（非表示、▼ で子がいることを示す）
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
  absPos, ancestors, borderOf, captionOf, descendants, displayCaption, fillOf, inNest, inTree, isHidden, isNesting, other,
  overflowOf, setOrDelete, setSpec, shapeOf, sizeOf, treeDirOf, viewOf,
} from "./model";
import { type Subtree, captionOfData, liveItems, pageMembers, pageNameOf, pageOf, subtreeIds } from "./pages";
import { createRenderer } from "./render";
import type { Geometry } from "./report";
import type { BoxData, BoxInfo, ChildView, Diagram, EdgeData, Id, Info, Items, ListItem, Overflow, Patch } from "./types";
import { OVERFLOWS, assignIds, checkSettings, normalizeEdge, validate } from "./validate";

export const DEFAULTS = {
  color: "#ffffff",
  gap: 8,        // 同じ階層のボックス同士の最小間隔
  padding: 12,   // 内包するボックスの内側の余白
  header: 30,    // 内包するボックスのキャプション欄の高さ
  treeGapX: 24,  // ツリーで横に並ぶ子の間隔
  treeGapY: 40,  // ツリーの親と子の縦の間隔
};

export interface GraphOptions extends Partial<typeof DEFAULTS> {
  onChange?: (data: Diagram) => void;
  onSelect?: (info: Info) => void;
  onHistory?: (state: HistoryState) => void; // 戻れる・進めるかが変わったとき
  onNotice?: (text: string) => void;          // 利用者に知らせたいこと（付け替えで線を外したなど）
  onBuild?: () => void;                       // 図を組み立て直した（ページの増減やキャプションを見直すため）
  onLiftOver?: (x: number, y: number) => void; // 付け替えのドラッグ中のポインタの位置（画面の座標。タブへのドラッグに使う）
  onLiftEnd?: () => void;                     // 付け替えのドラッグが終わった
  measureText?: MeasureText;                  // 文字の測り方（テストで偽物に差し替える。既定はブラウザで測る）
}

export type { HistoryState, Mode };
export { COPY_MIME, REMOVED_MIME } from "./interaction";

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
  onModeChange(listener: (mode: Mode) => void): () => void; // モードが変わったら知らせる（図の側で変えたときも）。外す関数を返す
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
  destroy(): void;
}

export function createGraph(container: HTMLElement, data: unknown, options: GraphOptions = {}): Graph {
  injectStyle(GRAPH_STYLE_ID, GRAPH_CSS);
  const opt = { ...DEFAULTS, ...options };
  container.classList.add("mz-stage");

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
  const boxOfEl = new WeakMap<Element, Box>();

  const world: World = {
    isWorld: true, id: null, el: worldEl, x: 0, y: 0, w: 0, h: 0, src: {},
    get children() { return roots; },
  };

  const measurer = createTextMeasurer(options.measureText);
  const L = createLayout({ opt, world, worldEl, container, measurer, roots: () => roots, edges: () => edges });
  const R = createRenderer({ opt, world, worldEl, nodes: () => nodes, edges: () => edges }, L);
  const {
    incident, innerArea, syncWorld, clamp, centerX,
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
    paste: (copy, parentId, at, from) => { paste(copy, parentId, at, from); },
    liftOver: (x, y) => opt.onLiftOver?.(x, y),
    liftEnd: () => opt.onLiftEnd?.(),
    // 一覧からドラッグして戻したら、線モードや削除モードのままだと戻した箱をすぐ動かせないので、移動モードにする
    restore: (id, parentId, at) => {
      restore(id, parentId, at);
      if (mode === "link" || mode === "remove") setMode("move");
    },
  }, L, R, createDrag(opt, L));

  function changed() {
    const data = api.toJSON();
    H.record(data);
    opt.onChange?.(data);
  }

  function notifySelect() {
    opt.onSelect?.(info(current));
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
    const used = new Set([...edges.map(e => e.id), ...offEdges.map(e => String(e.id))]);
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
      if (mode !== "link") return; // 線モード以外では、線は CSS でもクリックを受けない
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

  // ---- 親子の付け替え ----

  // id のボックス（子孫ごと）を parentId（今のページの箱。null は今のページの最上位）の子にする。同じ階層でなくなった線は外す。
  // id はほかのページの箱でもよい（タブへのドラッグでページを移したとき）。
  // 位置: 最上位なら at。子を内包しているグループなら、今ある子の下の左端。
  // それ以外（子の無いボックスやツリー、非表示）は自動で並べる
  function reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }) {
    const data = api.toJSON();
    const src = data.nodes.find(s => String(s.id) === String(id));
    if (!src) throw new Error(`ボックスがありません: ${id}`);
    const t = parentId == null ? null : (nodeOf(parentId) as Box);
    if (t?.src.page === true) throw new Error("ページの箱の中には移せません（そのページのタブへ運んでください）");
    const moving = subtreeIds(data.nodes, id);
    if (t && moving.has(t.id)) throw new Error("自分や自分の子孫の中には移せません");
    const to = t ? t.src.id : pageBox()?.id;
    if (String(src.parent ?? "") === String(to ?? "")) return false;
    // ページは入れ子にしない（ページの箱を、ページの中へは移せない）
    if (page != null && data.nodes.some(s => moving.has(String(s.id)) && s.page === true)) {
      opt.onNotice?.("ページの中には、ページの箱を入れられません");
      return false;
    }
    const fromPage = pageOf(data.nodes, id);
    setParent(src, t);
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
    select(byId.get(String(id))!);
    changed();
    const where = (t ? `「${keyOfBox(byId.get(t.id)!)}」の中` : "最上位") + (fromPage !== page ? `（${pageName(page)}）` : "");
    opt.onNotice?.(`${where}へ移しました` + (removed ? `（階層が変わったため、線を ${removed} 本外しました）` : ""));
    return true;
  }

  const pageName = (p: string | null) => pageNameOf(source.nodes, p);

  // ---- 削除と復活（docs/DELETE-plan.md） ----

  // n を子孫ごと消す。図は作り直さずにその場で外す（作り直すと、押し下げられた箱が本来いたい高さを忘れる）。
  // 今の位置を書いて removed の末尾へ移し、つながっていた線は捨てる。親は縮み（中身に合わせて伸びる祖先の
  // 大きさの指定は外す）、残った子は動かさない
  function remove(id: Id) {
    if (!byId.has(String(id))) return removeElsewhere(id);
    const n = nodeOf(id);
    if (n.isWorld) throw new Error("ワールドは消せません");
    const gone = new Set([n, ...descendants(n)]);
    // ほかのページにある子孫（消す箱がページの箱なら、そのページの中身）も一緒に消す
    const goneIds = subtreeIds(source.nodes, n.id);
    const out = api.toJSON();
    const moved = out.nodes.filter(s => goneIds.has(String(s.id)));
    source.removed = [...(source.removed ?? []), ...moved];
    source.nodes = source.nodes.filter(s => !goneIds.has(String(s.id)));
    offEdges = offEdges.filter(e => !goneIds.has(String(e.from)) && !goneIds.has(String(e.to)));
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

    if (current && gone.has(current)) select(null);
    if (linking && gone.has(linking)) setLinking(null);
    unfocus();
    settle(SCENES.remove, parent ?? undefined);
    render();
    changed();
    notifySelect();
    const kids = gone.size - 1;
    opt.onNotice?.(`「${keyOfBox(n)}」を消しました` +
      (kids || cut.length ? `（${[kids ? `子 ${kids} 個` : "", cut.length ? `線 ${cut.length} 本` : ""].filter(Boolean).join("、")}も）` : ""));
    return true;
  }

  // ほかのページの箱を子孫ごと消す（一覧の × から）。描いていないので、データだけを直す。
  // 今描いているページの箱そのものを消したら、最初のページに戻る
  function removeElsewhere(id: Id) {
    const s = source.nodes.find(x => String(x.id) === String(id));
    if (!s) throw new Error(`ボックスがありません: ${id}`);
    const goneIds = subtreeIds(source.nodes, id);
    const out = api.toJSON();
    const cut = offEdges.filter(e => goneIds.has(String(e.from)) || goneIds.has(String(e.to))).length;
    out.removed = [...(out.removed ?? []), ...out.nodes.filter(x => goneIds.has(String(x.id)))];
    out.nodes = out.nodes.filter(x => !goneIds.has(String(x.id)));
    out.edges = (out.edges as EdgeData[]).filter(e => !goneIds.has(String(e.from)) && !goneIds.has(String(e.to)));
    if (page != null && goneIds.has(page)) page = null;
    build(out, false);
    changed();
    notifySelect();
    const kids = goneIds.size - 1;
    opt.onNotice?.(`「${keyOf(s.id, captionOfData(s))}」を消しました` +
      (kids || cut ? `（${[kids ? `子 ${kids} 個` : "", cut ? `線 ${cut} 本` : ""].filter(Boolean).join("、")}も）` : ""));
    return true;
  }

  // 消したボックス id を、removed の中の子孫ごと parentId（null は最上位）の子に戻す。付け替えと同じく作り直す。
  // 位置: 内包（か子の無いボックス）の中や最上位なら at（親の中での位置）。ツリー・非表示の中なら自動で並べる。
  // at に置いてぶつかった相手は、ドラッグで手を離したときと同じく下へずらす。線は戻さない
  function restore(id: Id, parentId: Id | null, at?: { x: number; y: number }) {
    const data = api.toJSON();
    const list = data.removed ?? [];
    const root = list.find(s => String(s.id) === String(id));
    if (!root) throw new Error(`消したボックスにありません: ${id}`);
    const t = parentId == null ? null : (nodeOf(parentId) as Box);
    if (t?.src.page === true) throw new Error("ページの箱の中には戻せません（そのページのタブで戻してください）");
    const take = new Set([String(root.id)]);
    for (let grew = true; grew;) {
      grew = false;
      for (const s of list) {
        if (take.has(String(s.id)) || s.parent == null || !take.has(String(s.parent))) continue;
        take.add(String(s.id));
        grew = true;
      }
    }
    data.removed = list.filter(s => !take.has(String(s.id)));
    if (!data.removed.length) delete data.removed;
    setParent(root, t);
    const placeAt = at && (!t || viewOf(t) === "nest");
    if (placeAt) {
      root.x = Math.round(at.x);
      root.y = Math.round(at.y);
    } else {
      delete root.x;
      delete root.y;
    }
    data.nodes.push(...list.filter(s => take.has(String(s.id))));

    build(data, false);
    const n = byId.get(String(id))!;
    if (placeAt) {
      [n.x, n.y] = clamp(n, at.x, at.y);
      settle(SCENES.drop, n);
      render();
    }
    n.intendedY = n.y;
    n.intendedCX = centerX(n);
    select(n);
    changed();
    opt.onNotice?.(`「${keyOfBox(n)}」を戻しました`);
    return true;
  }

  // ほかのブックの箱を子孫ごと、parentId（null は今のページの最上位）の子にコピーする（移植。docs/TABS-plan.md 4.3）。
  // id はこのブックで空いている番号に振り直し、線は写した箱どうしのものだけ持ってくる（線の id も振り直す）。
  // ページの中へ落としたら、ページは入れ子にしないので、写した箱の page を外す。位置の扱いは復活と同じ。
  // 写した箱の新しい id を返す
  function paste(copy: Subtree, parentId: Id | null, at?: { x: number; y: number }, from?: string) {
    const data = api.toJSON();
    const t = parentId == null ? null : (nodeOf(parentId) as Box);
    if (t?.src.page === true) throw new Error("ページの箱の中には移植できません（そのページのタブで落としてください）");
    if (!copy.nodes.some(s => String(s.id) === copy.root)) throw new Error(`写した箱がありません: ${copy.root}`);
    const used = [...data.nodes, ...(data.removed ?? [])].map(s => Number(s.id)).filter(Number.isFinite);
    let next = Math.max(0, ...used) + 1;
    const ids = new Map(copy.nodes.map(s => [String(s.id), next++]));
    const nodes = copy.nodes.map(s => {
      const c: BoxData = { ...JSON.parse(JSON.stringify(s)), id: ids.get(String(s.id))! };
      if (String(s.id) === copy.root) setParent(c, t);
      else c.parent = ids.get(String(s.parent));
      if (page != null) { delete c.page; delete c.world; }
      return c;
    });
    const root = nodes[copy.nodes.findIndex(s => String(s.id) === copy.root)]!;
    const placeAt = at && (!t || viewOf(t) === "nest");
    if (placeAt) {
      root.x = Math.round(at.x);
      root.y = Math.round(at.y);
    } else {
      delete root.x;
      delete root.y;
    }
    const usedEdges = new Set((data.edges as EdgeData[]).map(e => String(e.id)));
    let seq = 1;
    const edges = copy.edges.map(e => {
      while (usedEdges.has("e" + seq)) seq++;
      usedEdges.add("e" + seq);
      return { ...e, id: "e" + seq, from: ids.get(String(e.from))!, to: ids.get(String(e.to))! };
    });
    data.nodes.push(...nodes);
    data.edges = [...(data.edges as EdgeData[]), ...edges];

    build(data, false);
    const n = byId.get(String(root.id))!;
    if (placeAt) {
      [n.x, n.y] = clamp(n, at.x, at.y);
      settle(SCENES.drop, n);
      render();
    }
    n.intendedY = n.y;
    n.intendedCX = centerX(n);
    select(n);
    changed();
    const kids = nodes.length - 1;
    const notes = [from ? `${from} から` : "", kids ? `子 ${kids} 個` : "", edges.length ? `線 ${edges.length} 本` : ""].filter(Boolean);
    opt.onNotice?.(`「${keyOfBox(n)}」を移植しました` + (notes.length ? `（${notes.join("、")}）` : ""));
    return String(root.id);
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
    const label = what === "width" ? "幅" : what === "height" ? "高さ" : "幅と高さ";
    opt.onNotice?.(`子 ${count} 個の${label}をそろえました` + (partial ? "（中身の都合で狭められない子があります）" : ""));
    return count;
  }

  function setMode(m: Mode) {
    I.endLift();
    I.unmarkRemove();
    if (m !== "link") setLinking(null);
    mode = m;
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

  const brief = (n: Box) => ({ id: n.id, caption: captionOf(n) });
  // 知らせに出す短いキー（長いキャプションでヘッダーが崩れないように）
  const keyOfBox = (n: Box) => keyOf(n.src.id, captionOf(n));

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
      canShape: !isNesting(n) && n.src.page !== true,
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
        // キャプションが空なら id を表示し、色が空なら既定色に戻す
        if ("caption" in next) {
          setOrDelete(n.src, "caption", String(next.caption ?? ""), next.caption == null || String(next.caption) === "");
        }
        if ("color" in next) setOrDelete(n.src, "color", String(next.color ?? ""), !next.color);
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
        if ("background" in next) setOrDelete(world.src, "background", String(next.background ?? ""), !next.background);
        storeWorld();
        syncWorld();
        applyWorldStyle();
      } else {
        applyStyle(n);
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

  // src を t の子にする。t が null なら今のページの最上位（ページの中ならページの箱の子）
  function setParent(src: BoxData, t: Box | null) {
    if (t) src.parent = t.src.id;
    else if (page != null) src.parent = pageBox()!.id;
    else delete src.parent;
  }

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
      intendedY: Number(src.y) || 0,
      intendedCX: NaN,
      capW: 0,
      el, head, textEl, moreEl, shapeSvg, treeSvg, treePath, treeFrame,
    };
    boxOfEl.set(el, n);
    return n;
  }

  // 読み込み直後のはみ出しの調整（fitToViewport）は、最初に開いたときだけ行う。
  // 外部（LLM など）の変更の読み直しでは行わない。行うと、ファイルの位置と画面の位置がずれていくため
  function load(newData: unknown, o: { keepHistory?: boolean } = {}) {
    const copy: unknown = newData == null ? newData : JSON.parse(JSON.stringify(newData));
    build(copy, !o.keepHistory);
    if (o.keepHistory) H.record();
    else H.reset();
  }

  // データを検証して描き直す。fit は読み込み直後のはみ出しの調整をするか
  function build(copy: unknown, fit: boolean) {
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
    select(null);
    opt.onBuild?.();
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
    undo: () => H.undo(),
    redo: () => H.redo(),
    history: () => H.state(),
    select(id) { select(id == null ? null : nodeOf(id) as Box); },
    selected: () => (current ? current.id : null),
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
          x, y, w: n.w, h: n.h, cut: displayCaption(n) !== captionOf(n),
        };
      });
      const at = (e: Edge, k: string) => Number(e.lines[0]!.getAttribute(k));
      const shown = edges.filter(e => e.el.style.display !== "none");
      return {
        viewport: L.viewport(),
        boxes,
        edges: shown.map(e => ({ id: e.id, a: e.a.id, b: e.b.id, x1: at(e, "x1"), y1: at(e, "y1"), x2: at(e, "x2"), y2: at(e, "y2") })),
      };
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
