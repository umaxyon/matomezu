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
 *   graph.update(id, patch);     // 変更する（caption, color, size, childView, fill, border, overflow）。size は大きさの指定も外す
 *   graph.dragging();            // ドラッグ中か（外部からの変更を、手を離すまで待つのに使う）
 *   graph.setMode(mode);         // ドラッグの働き: "move"（移動）/ "reparent"（親子の付け替え）
 *   graph.reparent(id, parentId, at); // id を parentId（null は最上位）の子にする。at は最上位へ移すときの位置
 *   graph.fitChildren(id, "width" | "height" | "both"); // 内包している子の大きさを、一番大きい子にそろえる
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
import { SVGNS, injectStyle } from "./dom";
import { createLayout } from "./layout";
import {
  type Box, type Container, type Edge, type World,
  ancestors, borderOf, captionOf, descendants, fillOf, inNest, inTree, isHidden, isInside, isNesting, other,
  overflowOf, setOrDelete, setSpec, shapeOf, sizeOf, treeDirOf, viewOf,
} from "./model";
import { createRenderer } from "./render";
import type { BoxData, BoxInfo, ChildView, Diagram, EdgeData, Id, Info, Overflow, Patch } from "./types";
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
  fitChildren(id: Id, what: "width" | "height" | "both"): number;
  destroy(): void;
}

interface Released {
  m: Box;
  specW: number;
  specH: number;
  width: number | undefined;
  height: number | undefined;
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
  let drag: {
    n: Box; sx: number; sy: number; ox: number; oy: number; moved: boolean;
    released: Released[] | null; // 動かし始めたときに外した、祖先の最小の大きさ
  } | null = null;
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

  const L = createLayout({ opt, world, worldEl, container, roots: () => roots, edges: () => edges });
  const R = createRenderer({ opt, world, worldEl, nodes: () => nodes, edges: () => edges }, L);
  const {
    incident, innerArea, syncWorld, fit, refitAncestors, clamp,
    tryMove, settleTree, anchorPlan, stepAside, settleAll, layout, sizable, naturalSize, minimumSize, compress,
  } = L;
  const { applyWorldStyle, applyStyle, renderEdges, render } = R;

  function blocked(n: Box) {
    if (n.el.classList.contains("mz-blocked")) return;
    n.el.classList.add("mz-blocked");
    setTimeout(() => n.el.classList.remove("mz-blocked"), 180);
  }

  function changed() {
    const data = api.toJSON();
    record(data);
    opt.onChange?.(data);
  }

  // ---- 履歴 ----
  // 変更のたびに図全体の JSON を1件として残す。戻るときはそれを読み込み直す

  let past: string[] = []; // 最後が今の状態
  let future: string[] = [];

  const historyState = (): HistoryState => ({ canUndo: past.length > 1, canRedo: future.length > 0 });
  const notifyHistory = () => opt.onHistory?.(historyState());

  function record(data = api.toJSON()) {
    const s = JSON.stringify(data);
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
    drag = { n: d, sx: e.clientX, sy: e.clientY, ox: d.x, oy: d.y, moved: false, released: null };
    d.el.classList.add("mz-dragging");
    focus(n);
  }

  function onPointerMove(e: PointerEvent) {
    if (lift) return moveLift(e);
    if (!drag) return;
    const { n } = drag;
    if (e.clientX === drag.sx && e.clientY === drag.sy && !drag.released) return; // まだ動いていない
    drag.released ??= releaseSizes(n);
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
    if (!moved && drag.released) restoreSizes(drag.released, drag.n);
    drag = null;
    unfocus();
    if (moved) {
      syncWorld();
      changed();
      notifySelect();
    }
  }

  // 中身を手で動かしたら、中身に合わせて伸びる祖先の最小の大きさ（width, height）を外し、中身に追従させる。
  // 「子のサイズをそろえる」で付いた大きさも、手で動かした方を優先する。
  // 幅に合わせて折り返す・切り詰めるグループは、大きさを意図して決めているので外さない
  function releaseSizes(n: Box): Released[] {
    const out: Released[] = [];
    for (const m of ancestors(n)) {
      if (overflowOf(m) !== "grow" || !(m.specW || m.specH)) continue;
      out.push({ m, specW: m.specW, specH: m.specH, width: m.src.width, height: m.src.height });
      setSpec(m, "w", 0);
      setSpec(m, "h", 0);
    }
    return out;
  }

  // 実際には動かさなかったときは、外した大きさを戻す
  function restoreSizes(list: Released[], n: Box) {
    for (const r of list) {
      r.m.specW = r.specW;
      r.m.specH = r.specH;
      if (r.width != null) r.m.src.width = r.width;
      if (r.height != null) r.m.src.height = r.height;
    }
    refitAncestors(n);
    render();
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

  // 内包している子の幅や高さを、今いちばん小さい子に合わせてそろえる。縮める方向にしか働かない
  // （ボックスは中身に合わせた大きさが正解なので、そろえるために大きくはしない）。
  // 広い子は中身を詰め直して縮め、中身の都合で目標まで縮められない子は、縮められるところまで縮める。
  // グループに大きさの指定（width, height）を付けるのは、目標にぴったり合わせるのに要るときだけ。
  // 両方なら幅を先にそろえる。そろえた子の数を返す
  function fitChildren(id: Id, what: "width" | "height" | "both") {
    const n = nodeOf(id);
    if (n.isWorld) throw new Error("ワールドの子はそろえられません");
    const kids = sizable(n);
    if (kids.length < 2) return 0;
    let partial = false;
    const align = (dim: "w" | "h") => {
      const cur = (k: Box) => (dim === "w" ? k.w : k.h);
      const target = Math.min(...kids.map(cur));
      for (const k of kids) {
        const t = Math.round(Math.max(target, minimumSize(k, dim)));
        if (t > target + 0.5) partial = true;
        compress(k, dim, t);
        // グループは中身に合わせた大きさが目標に届かないときだけ指定を付け、文字のボックスは常に指定する
        setSpec(k, dim, isNesting(k) && naturalSize(k, dim) >= t ? 0 : t);
        fit(k);
      }
    };
    if (what !== "height") align("w");
    if (what !== "width") align("h");
    settleAll(n);
    render();
    changed();
    notifySelect();
    const label = what === "width" ? "幅" : what === "height" ? "高さ" : "幅と高さ";
    opt.onNotice?.(`子 ${kids.length} 個の${label}をそろえました` + (partial ? "（中身の都合で狭められない子があります）" : ""));
    return kids.length;
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
      sizableChildren: sizable(n).length,
      childView: viewOf(n),
      treeDirection: treeDirOf(n),
      parent: n.parent ? brief(n.parent) : null,
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      children: n.children.map(brief),
      links: incident(n).map(e => ({ edgeId: e.id, ...brief(other(e, n)) })),
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
    // 大きさや見せ方が変わっても、線の角度と長さが変わらないよう本体の位置を保つ
    const keepAt = !n.isWorld && inNest(n) ? anchorPlan(n) : null;
    if (next.overflow && next.overflow !== overflowOf(n)) {
      if (n.isWorld) {
        n.src.overflow = next.overflow as Exclude<Overflow, "grow">;
      } else {
        // 大きさが固定される方向は、今の大きさを引き継ぐ
        if (overflowOf(n) === "grow") setSpec(n, "w", Math.round(n.hw));
        if (next.overflow === "clip") setSpec(n, "h", Math.round(n.hh));
        n.src.overflow = next.overflow;
      }
    }
    if (n.isWorld) {
      if ("background" in next) setOrDelete(world.src, "background", String(next.background ?? ""), !next.background);
      source.world = world.src;
      syncWorld();
      applyWorldStyle();
    } else {
      applyStyle(n);
      if (keepAt) {
        settleTree(n);
        [n.x, n.y] = clamp(n, keepAt.x(n), keepAt.y(n));
        stepAside(n);
      }
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
    fitChildren,
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
