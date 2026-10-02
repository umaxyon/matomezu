// 描画: ボックスの見た目、DB やツリーの線、ボックスどうしの線を DOM に反映する

import { isLightColor } from "./dom";
import type { Layout } from "./layout/layout";
import {
  type Box, type Edge, type World,
  absPos, ancestors, borderOf, captionOf, descendants, displayCaption, fillOf, inTree, isHidden, isNesting, isPageBox, overflowOf,
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

  // 2つの矩形を結ぶ線の両端。上下の範囲が重なっていれば（真横に並んでいれば）、重なる範囲の真ん中の高さで
  // 水平に、左右の範囲が重なっていれば垂直に引く（箱が伸び縮みしても、つなぐ位置が滑るだけで角度は変わらない）。
  // どちらも重ならなければ、中心どうしを結んだ線を縁で切る
  type Abs = { x: number; y: number; w: number; h: number };
  function edgeEnds(a: Abs, b: Abs): [number, number, number, number] {
    const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
    const left = Math.max(a.x, b.x), right = Math.min(a.x + a.w, b.x + b.w);
    if (bottom > top && right <= left) {
      const y = (top + bottom) / 2;
      return a.x < b.x ? [a.x + a.w, y, b.x, y] : [a.x, y, b.x + b.w, y];
    }
    if (right > left && bottom <= top) {
      const x = (left + right) / 2;
      return a.y < b.y ? [x, a.y + a.h, x, b.y] : [x, a.y, x, b.y + b.h];
    }
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    const [x1, y1] = clipToRect(acx, acy, a.w, a.h, bcx - acx, bcy - acy);
    const [x2, y2] = clipToRect(bcx, bcy, b.w, b.h, acx - bcx, acy - bcy);
    return [x1, y1, x2, y2];
  }

  // 線は本体（ツリーなら外枠）どうしを結ぶ。非表示の子や、ツリーの子同士の線は描かない（データには残す）
  function renderEdges() {
    for (const e of ctx.edges()) {
      const hidden = isHidden(e.a) || isHidden(e.b) || inTree(e.a);
      e.el.style.display = hidden ? "none" : "";
      if (hidden) continue;
      const [ax, ay] = absPos(e.a);
      const [bx, by] = absPos(e.b);
      const ra = anchorRect(e.a), rb = anchorRect(e.b);
      const [x1, y1, x2, y2] = edgeEnds(
        { x: ax + ra.x, y: ay + ra.y, w: ra.w, h: ra.h },
        { x: bx + rb.x, y: by + rb.y, w: rb.w, h: rb.h });
      for (const l of e.lines) {
        l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
        l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
      }
    }
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
