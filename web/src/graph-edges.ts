// 線の追加・削除・変更・つなぎ直し・整列。線の配列と選択は graph.ts が持ち、ここは ctx から受け取って直す。
// 線のドラッグ（区間・端・キャプション）は edge-drag.ts、道筋は routing.ts、描き方は render.ts
import { SVGNS } from "./dom";
import { type Pt, nearestAt, pointAt } from "./geom";
import { type Head, isHead } from "./heads";
import { t } from "./i18n";
import type { Mode } from "./interaction";
import { type Box, type Edge, type World, abilitiesOf, routeDefaultOf, setOrDelete } from "./model";
import { CAPTION_OFFSET_MAX } from "./render";
import { type RouteInput, alignedEnds, perimeterAt, vertexOf } from "./routing";
import { perimeter } from "./selfloop";
import type { Arrow, Dash, EdgeData, Route } from "./types";
import { ARROWS, DASHES, ROUTES, edgeIdMaker } from "./validate";

// updateEdge で変えられる線の項目（null で消す）
export interface EdgePatch {
  caption?: string | null; // 空か null で消す
  captionAt?: number | null;     // null で真ん中に戻す
  captionOffset?: number | null; // null で線の上に戻す
  arrow?: Arrow | null;
  startHead?: Head | null; // 端の形（heads.ts。null で消す）
  endHead?: Head | null;
  dash?: Dash | null;
  route?: Route | null;
  via?: number[] | null;
  exitAt?: number | null;
  enterAt?: number | null;
}

export interface EdgesContext {
  svg: SVGSVGElement;
  world: World;
  edges(): Edge[];                    // 描いている線（並びはこの配列。足すときは push）
  setEdges(list: Edge[]): void;
  offEdgeIds(): string[];             // ほかのページの線の id（新しい線の id と重ならないように）
  edgeOfEl: WeakMap<Element, Edge>;   // 線の要素（g）から線を引く
  mode(): Mode;
  currentEdge(): Edge | null;
  select(n: Box | null): void;
  selectEdge(e: Edge): void;
  toFront(e: Edge): void;             // 重なったほかの線より手前に描く
  routeInputOf(e: Edge): RouteInput;
  loopCornerNear(e: Edge, at: Pt): { exit: number; enter: number } | null; // 自分に戻る線の、at に一番近い空いた角
  settleDrop(n: Box): void;           // 近すぎる相手をどける（線でつながると最小間隔が広がる。layout.ts の gapBetween）
  render(): void;
  renderEdges(): void;
  unfocus(): void;
  blocked(n: Box): void;              // 引けない・つなげない印
  changed(): void;
  notifySelect(): void;
}

export type GraphEdges = ReturnType<typeof createEdges>;

export function createEdges(ctx: EdgesContext) {
  function newEdgeId() {
    return edgeIdMaker(new Set([...ctx.edges().map(e => e.id), ...ctx.offEdgeIds()]), ctx.edges().length + 1)();
  }

  function canLink(a: Box, b: Box) {
    if (a.parent !== b.parent || !abilitiesOf(a).link) return false;
    // 自分に戻る線は、同じ箱に何本でも引ける（輪の大きさを変えて重ねない。docs/SELFLOOP-plan.md）
    if (a === b) return true;
    return !ctx.edges().some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  function addEdge(src: EdgeData, a: Box, b: Box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "mz-edge");
    g.dataset.id = String(src.id); // 外から線を特定するため（線は手前に描き直すと並びが変わるので、順番では探さない）
    const line = document.createElementNS(SVGNS, "polyline");
    line.setAttribute("class", "mz-line");
    const arrowEl = document.createElementNS(SVGNS, "path");
    arrowEl.setAttribute("class", "mz-arrow");
    const headLineEl = document.createElementNS(SVGNS, "path");
    headLineEl.setAttribute("class", "mz-arrow-line");
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
    g.append(line, arrowEl, headLineEl, hit, handlesEl, endsEl);
    ctx.svg.appendChild(g);
    const e: Edge = {
      src, id: String(src.id), a, b, el: g, lines: [line, hit], arrowEl, headLineEl, points: [], handlesEl,
      shape: null, segments: [], arrangement: "diagonal", ends: null, memory: null, routeMemo: null, endsEl, labelEl: null,
    };
    // キャプションの札を押しても、線を選ぶ（札は render.ts が作ったり消したりするので、g で受け取る）
    g.addEventListener("click", ev => {
      if (ctx.mode() !== "move" || !(ev.target instanceof Element) || !ev.target.closest(".mz-label")) return;
      ev.stopPropagation();
      ctx.selectEdge(e);
    });
    // ポインタを乗せた線は、重なったほかの線より手前に描く（乗せたときの色が、重なった区間で隠れないように）
    g.addEventListener("pointerenter", () => ctx.toFront(e));
    ctx.edgeOfEl.set(g, e);
    for (const el of [hit, handlesEl]) {
      el.addEventListener("click", ev => {
        if (ctx.mode() !== "move") return; // 選択モード以外では、線は CSS でもクリックを受けない
        ev.stopPropagation();
        ctx.selectEdge(e);
      });
    }
    ctx.edges().push(e);
    return e;
  }

  function removeEdge(e: Edge) {
    e.el.remove();
    ctx.setEdges(ctx.edges().filter(x => x !== e));
    if (ctx.currentEdge() === e) ctx.select(null);
    ctx.unfocus();
    ctx.changed();
    ctx.notifySelect();
  }

  function updateEdge(e: Edge, patch: EdgePatch) {
    for (const k of ["exitAt", "enterAt"] as const) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v != null && !(v >= 0 && v <= 1)) throw new Error(t("{k} は 0 から 1 の数にしてください: {v}", { k, v }));
      setOrDelete(e.src, k, v ?? undefined, v == null);
    }
    if ("via" in patch) {
      if (patch.via != null && !(Array.isArray(patch.via) && patch.via.every(Number.isFinite))) throw new Error(t("via は数の並びにしてください"));
      setOrDelete(e.src, "via", patch.via ?? undefined, patch.via == null);
    }
    if ("route" in patch) {
      if (patch.route != null && !(ROUTES as readonly string[]).includes(patch.route)) throw new Error(t("route の値が不正です: {v}", { v: patch.route }));
      // 図の既定と同じなら書かない（既定を変えたとき一緒に変わるように）
      setOrDelete(e.src, "route", patch.route ?? undefined, patch.route == null || patch.route === routeDefaultOf(ctx.world));
    }
    if ("arrow" in patch) {
      if (patch.arrow != null && !(ARROWS as readonly string[]).includes(patch.arrow)) throw new Error(t("arrow の値が不正です: {v}", { v: patch.arrow }));
      setOrDelete(e.src, "arrow", patch.arrow ?? undefined, patch.arrow == null);
    }
    for (const k of ["startHead", "endHead"] as const) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v != null && !isHead(v)) throw new Error(t("{k} の値が不正です: {v}", { k, v }));
      setOrDelete(e.src, k, v ?? undefined, v == null);
    }
    if ("captionAt" in patch) {
      const v = patch.captionAt;
      if (v != null && !(v >= 0 && v <= 1)) throw new Error(t("captionAt は 0 から 1 の数にしてください: {v}", { v }));
      setOrDelete(e.src, "captionAt", v ?? undefined, v == null);
    }
    if ("captionOffset" in patch) {
      const v = patch.captionOffset;
      if (v != null && !Number.isFinite(v)) throw new Error(t("captionOffset は数にしてください: {v}", { v }));
      setOrDelete(e.src, "captionOffset", v == null ? undefined : Math.max(-CAPTION_OFFSET_MAX, Math.min(CAPTION_OFFSET_MAX, v)), v == null);
    }
    if ("caption" in patch) {
      const v = patch.caption == null ? "" : String(patch.caption).trim();
      setOrDelete(e.src, "caption", v, !v);
    }
    if ("dash" in patch) {
      if (patch.dash != null && !(DASHES as readonly string[]).includes(patch.dash)) throw new Error(t("dash の値が不正です: {v}", { v: patch.dash }));
      // 実線は既定なので、JSON には書かない
      setOrDelete(e.src, "dash", patch.dash ?? undefined, patch.dash == null || patch.dash === "solid");
    }
    // 端や形を決め直したら、自由な端の前の辺の記憶は使わない（一番よい形から）
    if ("exitAt" in patch || "enterAt" in patch || "via" in patch || "route" in patch) e.memory = null;
    // キャプションが付くと、つながった 2 つの箱の最小間隔が広がる（layout.ts の gapBetween）。近すぎれば終点の側をどける
    if ("caption" in patch && e.a !== e.b) {
      ctx.settleDrop(e.a);
      ctx.render();
    } else ctx.renderEdges();
    ctx.changed();
    ctx.notifySelect();
  }

  // 整列: 両端を、今の形での一番よい位置（辺の真ん中か、まっすぐ結べる位置）に固定し、手で直した区間は消す（docs/EDGE-SPEC.md の C1）
  function alignEdge(e: Edge) {
    if (e.a === e.b || e.points.length < 2 || !e.ends) return;
    updateEdge(e, { ...alignedEnds(ctx.routeInputOf(e), e.points), via: null });
  }

  // a から b へ線を引く（引けなければ何もせず false）。from（引き始めた〇の辺の真ん中）と at（離した所）はワールドの座標。
  // from があれば始点をそこに、at があれば終点を at に一番近いふちの点（ひし形は頂点）に固定する。
  // 同じ箱なら自分に戻る線で、at に一番近い角が空いていれば、端をその角に固定する（docs/EDGE-TOOL-plan.md）
  function link(a: Box, b: Box, at?: [number, number], from?: [number, number], members?: { from?: string; to?: string }): boolean {
    if (!canLink(a, b)) {
      ctx.blocked(b);
      return false;
    }
    // 画面で引いた線は、終点に矢印を付けておく（2026-10-11 ユーザー。外せるのはサイドバーと編集ダイアログ）
    const src: EdgeData = { id: newEdgeId(), from: a.src.id!, to: b.src.id!, arrow: "end" };
    // クラスの箱の属性・操作につなぐ線は、行の左右の端（相手のいる側）に付くので、端の位置は書かない（docs/CLASS-plan.md）
    if (a !== b && members?.from != null) { src.fromMember = members.from; from = undefined; }
    if (a !== b && members?.to != null) { src.toMember = members.to; at = undefined; }
    const e = addEdge(src, a, b);
    // 線でつながると、2 つの箱の最小間隔が広がる（layout.ts の gapBetween）。近すぎれば、始点の箱はそのままで終点の側をどける
    if (a !== b) ctx.settleDrop(a);
    if (a !== b && (at || from)) {
      if (from) fixEnd(e, "exit", from);
      if (at) fixEnd(e, "enter", at);
    }
    if (a !== b) ctx.render(); else ctx.renderEdges();
    const corner = a === b && at ? ctx.loopCornerNear(e, at) : null;
    if (corner) {
      e.src.exitAt = Math.round(corner.exit * 1000) / 1000; // 端をつまんで動かしたときと同じ桁
      e.src.enterAt = Math.round(corner.enter * 1000) / 1000;
      ctx.renderEdges();
    }
    ctx.changed();
    ctx.notifySelect();
    return true;
  }

  // 線 e の端（exit は始点、enter は終点）を、p（ワールドの座標）に一番近い箱の縁の位置に固定する（頂点にしかつなげない形は一番近い頂点）
  function fixEnd(e: Edge, end: "exit" | "enter", p: [number, number]) {
    const input = ctx.routeInputOf(e);
    const r = end === "exit" ? input.a : input.b;
    const q = pointAt(perimeter(r), nearestAt(perimeter(r), p[0], p[1]));
    const vertex = end === "exit" ? input.aVertex : input.bVertex;
    e.src[end === "exit" ? "exitAt" : "enterAt"] = perimeterAt(r, vertex ? vertexOf(r, q) : q);
  }

  // 線 e の端を、箱 to につなぎ替えられるか（残課題 E12）。線を引くときと同じ決まり: もう一方の端と同じ階層で、同じ組の線がほかに無いこと。
  // もう一方の端と同じ箱なら、自分に戻る線になる（何本でもよい）。今つないでいる箱は付け替えにならない
  function canReconnect(e: Edge, end: "exit" | "enter", to: Box): boolean {
    const own = end === "exit" ? e.a : e.b, other = end === "exit" ? e.b : e.a;
    if (to === own || to.parent !== other.parent || !abilitiesOf(to).link) return false;
    if (to === other) return true;
    return !ctx.edges().some(o => o !== e && ((o.a === to && o.b === other) || (o.a === other && o.b === to)));
  }

  // 線 e の端を箱 to につなぎ替え、端を離した所 at（ワールドの座標）に近い縁に固定する。キャプション・矢印・線の種類はそのまま。
  // 道筋（折れ目 via）と、付け替えた端の位置・クラスの行は捨てる。自分に戻る線になる・でなくなるときは、両端の位置を捨てる（意味が変わるため）
  function reconnect(e: Edge, end: "exit" | "enter", to: Box, at: [number, number]): boolean {
    if (!canReconnect(e, end, to)) {
      ctx.blocked(to);
      return false;
    }
    const wasLoop = e.a === e.b;
    if (end === "exit") { e.a = to; e.src.from = to.src.id!; delete e.src.fromMember; delete e.src.exitAt; }
    else { e.b = to; e.src.to = to.src.id!; delete e.src.toMember; delete e.src.enterAt; }
    const loop = e.a === e.b;
    if (wasLoop || loop) { delete e.src.exitAt; delete e.src.enterAt; }
    delete e.src.via;
    e.memory = null;
    e.routeMemo = null;
    if (!loop) {
      // 線でつながると最小間隔が広がる（layout.ts の gapBetween）。近すぎれば、つなぎ替えた先はそのままで、もう一方をどける
      ctx.settleDrop(to);
      ctx.render();
      fixEnd(e, end, at);
      ctx.renderEdges();
    } else {
      ctx.renderEdges();
      const corner = ctx.loopCornerNear(e, at);
      if (corner) {
        e.src.exitAt = Math.round(corner.exit * 1000) / 1000;
        e.src.enterAt = Math.round(corner.enter * 1000) / 1000;
        ctx.renderEdges();
      }
    }
    ctx.changed();
    ctx.notifySelect();
    return true;
  }

  return { newEdgeId, canLink, addEdge, removeEdge, updateEdge, alignEdge, link, canReconnect, reconnect };
}
