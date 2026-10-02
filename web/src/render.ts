// 描画: ボックスの見た目、DB やツリーの線、ボックスどうしの線を DOM に反映する

import { isLightColor } from "./dom";
import type { Layout } from "./layout/layout";
import {
  type Box, type Edge, type World,
  BEND_MARGIN, absPos, ancestors, arrowOf, borderOf, dashOf, routeOf, captionOf, descendants, displayCaption, fillOf, inTree, isHidden, isNesting, isPageBox, overflowOf,
  shapeOf, sizeOf, treeDirOf, viewOf,
} from "./model";
import { OVERFLOWS, SHAPES, SIZES } from "./validate";

// スティックマン（viewBox 0 0 36 52）
const PERSON_SVG =
  '<g class="mz-figure"><circle cx="18" cy="8" r="6.5"/><path d="M18 14.5V33M5 21.5H31M18 33 7 50M18 33 29 50"/></g>';

export interface RenderContext {
  opt: { color: string; header: number; treeGapY: number };
  world: World;
  worldEl: HTMLElement;
  nodes(): Box[];
  edges(): Edge[];
}

export type Renderer = ReturnType<typeof createRenderer>;

export function createRenderer(ctx: RenderContext, L: Layout) {
  const { opt, world, worldEl } = ctx;
  const { anchorRect } = L;

  // 背景色。明るさに合わせて、ワールドの中の文字や線を見やすい配色にする（graph-style.ts の .mz-on-light / .mz-on-dark）
  function applyWorldStyle() {
    const bg = world.src.background;
    worldEl.style.background = bg || "";
    const light = bg ? isLightColor(bg) : null;
    worldEl.classList.toggle("mz-on-light", light === true);
    worldEl.classList.toggle("mz-on-dark", light === false);
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
    const page = isPageBox(n);
    for (const sh of SHAPES) head.classList.toggle("mz-shape-" + sh, sh === shape && !page);
    head.classList.toggle("mz-shape-page", page);
    // 文字を塗りの上に書くのは、ボックスと DB（塗りつぶしあり）だけ
    const onFill = !group && fill && shape !== "person";
    const light = onFill && isLightColor(color);
    head.classList.toggle("mz-dark", onFill && light);
    head.classList.toggle("mz-light", onFill && !light);
    const edge = `color-mix(in srgb, ${color} 70%, #000)`;
    if (shape === "box" && !page) {
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
      } else if (page) {
        // タブ付きの見出し（フォルダ）。輪郭は renderPage で大きさに合わせて描く
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<path class="mz-page-body"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = borderOf(n) || !fill ? (fill ? edge : color) : "none";
        svg.style.strokeWidth = "1.5";
        svg.style.filter = fill ? "drop-shadow(var(--mz-shadow))" : "";
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

  // ページの箱: 左上に耳（タブ）の付いた見出し。耳の高さは graph-style.ts の .mz-shape-page の上の余白と合わせる
  function renderPage(n: Box) {
    const e = sizeOf(n) === "S" ? 6 : 9;
    const r = 4;
    const x0 = 1, x1 = n.hw - 1, y0 = 1, y1 = n.hh - 1, top = y0 + e;
    const ear = Math.max(x0 + 2 * r, Math.min(x0 + Math.max(n.hw * 0.4, 36), x1 - e - 2 * r)); // 耳の右端
    n.shapeSvg.firstElementChild?.setAttribute("d",
      `M${x0},${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${ear}L${ear + e},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}` +
      `V${y1 - r}Q${x1},${y1} ${x1 - r},${y1}H${x0 + r}Q${x0},${y1} ${x0},${y1 - r}Z`);
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

  type Abs = { x: number; y: number; w: number; h: number };
  type Pt = [number, number];

  // 2つの矩形を結ぶ線の点の並び。上下の範囲が重なっていれば（真横に並んでいれば）、重なる範囲の真ん中の高さで
  // 水平に、左右の範囲が重なっていれば垂直に引く（箱が伸び縮みしても、つなぐ位置が滑るだけで角度は変わらない）。
  // どちらも重ならなければ、直線は中心どうしを結んだ線を縁で切る。折れ線（elbow）は、箱と箱の間の隙間（横 gx、縦 gy）で形を決める:
  // - 縦の隙間が横の隙間の 1/3 より小さい（ほぼ横に並ぶ）: 横・縦・横の Z 字。向き合う辺の真ん中の高さから出て、間の真ん中で折れる
  // - 横の隙間が縦の隙間の 1/3 より小さい（ほぼ縦に並ぶ）: 縦・横・縦の Z 字
  // - それ以外（はっきり斜め）: L 字。隙間の大きい向きに先に出る（横なら、横の辺の真ん中から出て、相手の上か下の辺の真ん中に入る）
  // 1/3 は見た目で調整する前提の仮の値（ELBOW_Z_RATIO）。中棒の位置の調整、ほかの箱を避けることは、まだしない（docs/EDGE-plan.md）
  // Z 字の中棒が動ける範囲（axis の向きの座標。from が a の辺、to が b の辺）
  type Span = { axis: "x" | "y"; from: number; to: number };
  // bend は Z 字の中棒の位置（範囲の中の割合。null なら自動）。obstacles は線が通ってほしくない箱（同じ親のほかの箱）
  function edgePoints(a: Abs, b: Abs, elbow: boolean, bend: number | null, obstacles: Abs[]): { pts: Pt[]; span: Span | null } {
    const plain = (pts: Pt[]) => ({ pts, span: null });
    const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
    const left = Math.max(a.x, b.x), right = Math.min(a.x + a.w, b.x + b.w);
    if (bottom > top && right <= left) {
      const y = (top + bottom) / 2;
      return plain(a.x < b.x ? [[a.x + a.w, y], [b.x, y]] : [[a.x, y], [b.x + b.w, y]]);
    }
    if (right > left && bottom <= top) {
      const x = (left + right) / 2;
      return plain(a.y < b.y ? [[x, a.y + a.h], [x, b.y]] : [[x, a.y], [x, b.y + b.h]]);
    }
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    if (!elbow) {
      return plain([clipToRect(acx, acy, a.w, a.h, bcx - acx, bcy - acy), clipToRect(bcx, bcy, b.w, b.h, acx - bcx, acy - bcy)]);
    }
    // 向き合う辺（a の出る辺と b の入る辺）の位置
    const ax = bcx > acx ? a.x + a.w : a.x, bxSide = bcx > acx ? b.x : b.x + b.w;
    const ay = bcy > acy ? a.y + a.h : a.y, bySide = bcy > acy ? b.y : b.y + b.h;
    const gx = Math.abs(bxSide - ax), gy = Math.abs(bySide - ay);
    if (gy < gx * ELBOW_Z_RATIO) {
      const z = (m: number): Pt[] => [[ax, acy], [m, acy], [m, bcy], [bxSide, bcy]];
      const span: Span = { axis: "x", from: ax, to: bxSide };
      return { pts: z(bendAt(span, bend, m => z(m), obstacles)), span };
    }
    if (gx < gy * ELBOW_Z_RATIO) {
      const z = (m: number): Pt[] => [[acx, ay], [acx, m], [bcx, m], [bcx, bySide]];
      const span: Span = { axis: "y", from: ay, to: bySide };
      return { pts: z(bendAt(span, bend, m => z(m), obstacles)), span };
    }
    return plain(gx >= gy ? [[ax, acy], [bcx, acy], [bcx, bySide]] : [[acx, ay], [acx, bcy], [bxSide, bcy]]);
  }

  // Z 字の中棒を置く位置（span の向きの座標）。bend があればその割合（両端に余白を残す）。
  // 無ければ真ん中。真ん中だと線がほかの箱を通るなら、真ん中から外へ BEND_STEP ずつ試し、通らない一番近い位置。どこも通るなら真ん中
  function bendAt(span: Span, bend: number | null, shape: (m: number) => Pt[], obstacles: Abs[]): number {
    const [lo, hi] = bendRange(span);
    const mid = (span.from + span.to) / 2;
    if (hi < lo) return mid;
    if (bend != null) return Math.min(hi, Math.max(lo, span.from + (span.to - span.from) * bend));
    const clear = (m: number) => !obstacles.some(o => passes(shape(m), o));
    for (let d = 0; mid - d >= lo || mid + d <= hi; d += BEND_STEP) {
      if (mid + d <= hi && clear(mid + d)) return mid + d;
      if (d && mid - d >= lo && clear(mid - d)) return mid - d;
    }
    return mid;
  }

  // 中棒が動ける座標の範囲。両端は矢印が箱に食い込まないよう BEND_MARGIN 空ける
  function bendRange(span: Span): [number, number] {
    return [Math.min(span.from, span.to) + BEND_MARGIN, Math.max(span.from, span.to) - BEND_MARGIN];
  }

  // 点の並びのどこかの区間が、矩形の内側を通るか（縁に触れるだけのものは数えない）
  function passes(pts: Pt[], r: Abs) {
    const x0 = r.x + 1, y0 = r.y + 1, x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
    // 中棒の線はどれも縦か横なので、区間の矩形と内側が重なるかで調べられる
    return pts.slice(1).some(([qx, qy], i) => {
      const [px, py] = pts[i]!;
      return Math.max(px, qx) > x0 && Math.min(px, qx) < x1 && Math.max(py, qy) > y0 && Math.min(py, qy) < y1;
    });
  }

  const BEND_STEP = 4;    // 中棒の位置を探すときの刻み

  // 折れ線で、片方の隙間がもう片方のこれだけより小さければ、L 字ではなく Z 字にする（見た目で調整する前提の仮の値）
  const ELBOW_Z_RATIO = 1 / 3;

  // 線は本体（ツリーなら外枠）どうしを結ぶ。非表示の子や、ツリーの子同士の線は描かない（データには残す）
  function renderEdges() {
    // 線が通ってほしくない箱: 同じ親を持つ、見えている箱（枠ごと。子孫はその中に入っている）
    const frames = new Map<Box | null, { n: Box; r: Abs }[]>();
    const siblingsOf = (p: Box | null) => {
      let list = frames.get(p);
      if (!list) {
        list = ctx.nodes().filter(n => n.parent === p && !isHidden(n)).map(n => {
          const [x, y] = absPos(n);
          return { n, r: { x, y, w: n.w, h: n.h } };
        });
        frames.set(p, list);
      }
      return list;
    };
    for (const e of ctx.edges()) {
      const hidden = isHidden(e.a) || isHidden(e.b) || inTree(e.a);
      e.el.style.display = hidden ? "none" : "";
      if (hidden) continue;
      const [ax, ay] = absPos(e.a);
      const [bx, by] = absPos(e.b);
      const ra = anchorRect(e.a), rb = anchorRect(e.b);
      const obstacles = siblingsOf(e.a.parent).filter(o => o.n !== e.a && o.n !== e.b).map(o => o.r);
      const bend = typeof e.src.bend === "number" ? e.src.bend : null;
      const { pts, span } = edgePoints(
        { x: ax + ra.x, y: ay + ra.y, w: ra.w, h: ra.h },
        { x: bx + rb.x, y: by + rb.y, w: rb.w, h: rb.h },
        routeOf(e, ctx.world) === "elbow", bend, obstacles);
      e.points = pts;
      e.span = span;
      // 中棒の位置は Z 字のときだけ意味がある。Z 字でなくなった線からは消す（データに効かない値を残さない。
      // 次に Z 字に戻ったときは、そのときの位置関係で自動で決める。docs/EDGE-plan.md）
      if (!span && e.src.bend != null) delete e.src.bend;
      // Z 字の中棒をつかむ透明な線
      e.bendEl.style.display = span ? "" : "none";
      if (span) {
        const [[x1, y1], [x2, y2]] = [pts[1]!, pts[2]!];
        e.bendEl.setAttribute("x1", String(x1)); e.bendEl.setAttribute("y1", String(y1));
        e.bendEl.setAttribute("x2", String(x2)); e.bendEl.setAttribute("y2", String(y2));
        e.bendEl.classList.toggle("mz-bend-x", span.axis === "x");
      }
      const arrow = arrowOf(e);
      const atStart = arrow === "start" || arrow === "both", atEnd = arrow === "end" || arrow === "both";
      // 見える線は、矢印のある端では矢印の付け根で止める（線の太さで先端が四角く太って見えないように）。
      // クリックを受ける透明な線は端まで
      const [line, hit] = e.lines as [SVGPolylineElement, SVGPolylineElement];
      const shown = pts.map(p => [...p] as Pt);
      const n = pts.length;
      if (atStart) shown[0] = toward(pts[0]!, pts[1]!, ARROW_LEN - 1);
      if (atEnd) shown[n - 1] = toward(pts[n - 1]!, pts[n - 2]!, ARROW_LEN - 1);
      setPoints(line, shown);
      setPoints(hit, pts);
      line.classList.toggle("mz-dashed", dashOf(e) === "dashed");
      const heads = [];
      if (atStart) heads.push(arrowHead(pts[1]!, pts[0]!));
      if (atEnd) heads.push(arrowHead(pts[n - 2]!, pts[n - 1]!));
      e.arrowEl.setAttribute("d", heads.join(""));
    }
  }

  const round = (v: number) => Math.round(v * 10) / 10;
  function setPoints(l: SVGPolylineElement, pts: Pt[]) {
    l.setAttribute("points", pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" "));
  }

  // p から q の向きへ d だけ進んだ点（区間より長ければ真ん中で止める）
  function toward(p: Pt, q: Pt, d: number): Pt {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1) return [...p];
    const k = Math.min(d, len / 2) / len;
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  }

  const ARROW_LEN = 10; // 矢印の長さ

  // f から t へ向かう区間の、t の側の矢印の三角（先端が t）。区間が短すぎれば描かない
  function arrowHead([fx, fy]: Pt, [tx, ty]: Pt) {
    const len = Math.hypot(tx - fx, ty - fy);
    if (len < 1) return "";
    const ux = (tx - fx) / len, uy = (ty - fy) / len;
    const L = ARROW_LEN, W = 6; // 矢印の長さと、軸からの半分の幅（幅は 12px）
    const bx = tx - ux * L, by = ty - uy * L;
    const r = (n: number) => Math.round(n * 10) / 10;
    return `M${r(tx)},${r(ty)}L${r(bx - uy * W)},${r(by + ux * W)}L${r(bx + uy * W)},${r(by - ux * W)}Z`;
  }

  function render() {
    for (const n of ctx.nodes()) {
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
      if (isPageBox(n)) renderPage(n);
      renderTree(n);
    }
    renderEdges();
  }

  function blocked(n: Box) {
    if (n.el.classList.contains("mz-blocked")) return;
    n.el.classList.add("mz-blocked");
    setTimeout(() => n.el.classList.remove("mz-blocked"), 180);
  }

  // ---- フォーカス（Obsidian 風: 関係の無いものを薄くする） ----

  function focus(n: Box) {
    const near = new Set([n, ...descendants(n)]);
    for (const e of ctx.edges()) {
      const on = e.a === n || e.b === n;
      if (on) { near.add(e.a); near.add(e.b); }
      e.el.classList.toggle("mz-hi", on);
      e.el.classList.toggle("mz-dim", !on);
    }
    for (const m of [...near]) ancestors(m).forEach(p => near.add(p));
    for (const o of ctx.nodes()) o.el.classList.toggle("mz-dim", !near.has(o));
  }

  function unfocus() {
    for (const e of ctx.edges()) e.el.classList.remove("mz-hi", "mz-dim");
    for (const o of ctx.nodes()) o.el.classList.remove("mz-dim");
  }

  return { applyWorldStyle, applyStyle, renderDb, renderTree, renderEdges, render, blocked, focus, unfocus };
}
