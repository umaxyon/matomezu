// 描画: ボックスの見た目、DB やツリーの線、ボックスどうしの線を DOM に反映する

import { SVGNS, isLightColor } from "./dom";
import { THEMES, isTheme, setThemeVars, type Theme } from "./theme";
import type { Layout } from "./layout/layout";
import { leftNormalAt, pointAt, polylineLength } from "./geom";
import { route, scopeObstacles } from "./routing";
import { cornerAt, nearestCorner, selfLoop } from "./selfloop";
import type { RouteFix, RouteInput } from "./routing";
import {
  type Box, type Edge, type World,
  BEND_MARGIN, absPos, bodyLinesOf, bodyOf, bodyWrapW, ancestors, arrowOf, borderOf, viaOf, dashOf, routeOf, captionOf, descendants, displayCaption, fillOf, inList, inTree, isHidden, isNesting, isPageBox, overflowOf,
  shapeOf, sizeOf, treeDirOf, viewOf,
} from "./model";
import { OVERFLOWS, SHAPES, SIZES } from "./validate";

// スティックマン（viewBox 0 0 36 52）
const PERSON_SVG =
  '<g class="mz-figure"><circle cx="18" cy="8" r="6.5"/><path d="M18 14.5V33M5 21.5H31M18 33 7 50M18 33 29 50"/></g>';

export interface RenderContext {
  opt: { color: string; header: number; treeGapY: number; padding: number };
  world: World;
  worldEl: HTMLElement;
  nodes(): Box[];
  edges(): Edge[];
  fixEdge(e: Edge, fix: RouteFix): void; // 線の道筋を決めたときに分かった、データに書き戻すこと（graph が直す）
  themeOf(n: Box | null): Theme; // 箱（null はワールド）に効いているテーマ
  paintOf(n: Box): { color: string; own: boolean }; // 箱を塗る色と、それがデータの color から来たか（テーマと色の名前を解いたもの）
  backgroundOf(): string | null; // 図の背景の色（world.background とテーマから。無ければ null）
}

export type Renderer = ReturnType<typeof createRenderer>;

// 付箋の折り返しの大きさ（px。graph-style.ts の .mz-style-sticky::after と合わせる）
const FOLD = 12;

// 影の CSS の値（"0 3px 5px rgba(...)"。複数あれば最初の 1 つ）を、SVG の feDropShadow の値にする。読めなければ null
function parseShadow(css: string): { dx: number; dy: number; blur: number; color: string } | null {
  const first = css.split(/,(?![^(]*\))/)[0]!.trim();
  const color = first.match(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b|\b[a-z]+\b(?!\()/i)?.[0];
  const nums = first.replace(color ?? "", " ").match(/-?[\d.]+/g)?.map(Number) ?? [];
  if (!color || nums.length < 2) return null;
  return { dx: nums[0]!, dy: nums[1]!, blur: nums[2] ?? 0, color };
}

// 線のキャプションを線から離せる量（px）
export const CAPTION_OFFSET_MAX = 60;


export function createRenderer(ctx: RenderContext, L: Layout) {
  const { opt, worldEl } = ctx;
  const { anchorRect } = L;

  // 背景色。明るさに合わせて、ワールドの中の文字や線を見やすい配色にする（graph-style.ts の .mz-on-light / .mz-on-dark）
  function applyWorldStyle() {
    const theme = ctx.themeOf(null);
    setThemeVars(worldEl, theme);
    // 背景は world.background が優先。無ければテーマの背景（あれば配色をその背景で固定する）
    const bg = ctx.backgroundOf();
    worldEl.style.background = bg || "";
    // 線の色は背景と混ぜて作る（graph-style.ts の --mz-edge）
    if (bg) worldEl.style.setProperty("--mz-bg", bg);
    else worldEl.style.removeProperty("--mz-bg");
    const light = bg ? isLightColor(bg) : null;
    worldEl.classList.toggle("mz-on-light", light === true);
    worldEl.classList.toggle("mz-on-dark", light === false);
  }

  // ---- 描画 ----

  // 形（ひし形・DB・ページの見出し）の影。CSS の drop-shadow を SVG にかけると、SVG の四角い範囲全体がうっすら灰色になる
  // （Chrome。背景が透けず箱の縁が見える）ので、SVG の中の feDropShadow で本体の図形にだけかける。css は CSS の影の値（変数も可）、null で影なし
  let shadowSeq = 0;
  function setShadow(n: Box, css: string | null) {
    const svg = n.shapeSvg;
    const body = svg.firstElementChild as SVGElement | null;
    svg.style.filter = "";
    svg.querySelector(":scope > defs.mz-shadow-defs")?.remove();
    if (!body) return;
    const value = css?.startsWith("var(") ? getComputedStyle(n.head).getPropertyValue(css.slice(4, -1).trim()) : css;
    const sh = value ? parseShadow(value) : null;
    if (!sh) { body.removeAttribute("filter"); return; }
    const id = `mz-shadow-${++shadowSeq}`;
    // 図形の後ろに置く（本体と縁は先頭の子として扱われるので、順番を変えない）
    svg.insertAdjacentHTML("beforeend", `<defs class="mz-shadow-defs"><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
      `<feDropShadow dx="${sh.dx}" dy="${sh.dy}" stdDeviation="${sh.blur / 2}" flood-color="${sh.color}"/></filter></defs>`);
    body.setAttribute("filter", `url(#${id})`);
  }

  // 見せ方に合わせて、本体の形・色・文字・子の表示を整える
  function applyStyle(n: Box) {
    const head = n.head;
    const theme = ctx.themeOf(n);
    // テーマを書いた箱に、角の丸みと余白の変数を付ける（子孫へ受け継ぐ）。測った大きさを使い回す鍵にテーマを入れるため、
    // 効いているテーマの印も付ける（measure.ts の鍵は本体のクラス）
    setThemeVars(n.el, isTheme(n.src.theme) ? theme : null);
    for (const t of THEMES) head.classList.toggle("mz-t-" + t.id, t === theme);
    const { color, own } = ctx.paintOf(n); // own: データの色（値か名前）で塗っているか
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

    const shape = shapeOf(n);
    const page = isPageBox(n);
    for (const sh of SHAPES) head.classList.toggle("mz-shape-" + sh, sh === shape && !page);
    head.classList.toggle("mz-shape-page", page);
    // 文字を塗りの上に書くのは、ボックスと DB（塗りつぶしあり）だけ
    const onFill = !group && fill && shape !== "person";
    const light = onFill && isLightColor(color);
    head.classList.toggle("mz-dark", onFill && light);
    head.classList.toggle("mz-light", onFill && !light);
    // テーマの文字の色は明るい塗りの上だけ（色を書いた暗い箱は、塗りの明るさで白い文字にする）
    head.style.color = onFill && theme.text && light ? theme.text : "";
    const edge = theme.border ?? `color-mix(in srgb, ${color} 70%, #000)`;
    const shadowOf = () => (theme.shadow === "none" ? null : theme.shadow ?? "var(--mz-shadow)");
    // 付箋（テーマのスタイル）: 右上の角を切り欠き、折り返しの三角を重ねる（graph-style.ts の .mz-style-sticky）。
    // 影は切り欠きに沿うよう、box-shadow ではなく drop-shadow で付ける
    const folded = theme.style === "sticky" && shape === "box" && !page && !group && fill;
    head.classList.toggle("mz-style-sticky", folded);
    head.style.filter = folded && shadowOf() ? `drop-shadow(${shadowOf()})` : "";
    if (folded) head.style.setProperty("--mz-fold", `color-mix(in srgb, ${color} 70%, #6b5a2a)`);
    else head.style.removeProperty("--mz-fold");
    if (shape === "box" && !page) {
      head.style.background = !fill ? "transparent"
        : group ? `color-mix(in srgb, ${color} 16%, transparent)`
        : folded ? `linear-gradient(225deg, transparent ${FOLD}px, ${color} 0)` : color;
      const shadow: string[] = [];
      // 塗りの無い文字の箱の枠は、箱の色で引く（テーマが箱ごとの色を使わないなら、テーマの枠の色。白い箱の色だと見えないため）
      const frame = group ? color : !fill ? (own || !theme.border ? color : theme.border) : edge;
      if (borderOf(n)) shadow.push(`inset 0 0 0 2px ${frame}`);
      else if (theme.outline && !group && fill) shadow.push(`inset 0 0 0 1.5px ${edge}`);
      const s = shadowOf();
      if (fill && s && !folded) shadow.push(s);
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
        svg.style.stroke = own ? color : "var(--mz-text)";
        svg.style.fill = "";
        setShadow(n, null);
      } else if (shape === "diamond") {
        // ひし形。頂点は renderDiamond で大きさに合わせて置く
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<polygon class="mz-diamond-body"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = fill ? edge : color;
        svg.style.strokeWidth = "1.5";
        setShadow(n, fill ? shadowOf() : null);
      } else if (page) {
        // タブ付きの見出し（フォルダ）。輪郭は renderPage で大きさに合わせて描く
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<path class="mz-page-body"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = borderOf(n) || !fill ? (fill ? edge : color) : "none";
        svg.style.strokeWidth = "1.5";
        setShadow(n, fill ? shadowOf() : null);
      } else {
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<path class="mz-db-body"/><path class="mz-db-rim" fill="none"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = fill ? edge : color;
        svg.style.strokeWidth = "1.5";
        // DB には影を付けない（下の縁が箱の枠で切れて、輪郭に色が付いたように見えるため。2026-10-10 ユーザー）
        setShadow(n, null);
      }
    }

    const caption = captionOf(n);
    const shown = displayCaption(n);
    n.textEl.className = group ? "mz-caption" : "mz-text";
    n.textEl.style.lineHeight = group ? opt.header + "px" : "";
    n.textEl.textContent = shown;
    head.title = shown !== caption ? caption : "";
    // 本文（docs/BODY-plan.md）。子の無い箱は本体の中でキャプションの下に、内包する箱は見出しの下に置く（位置は render で）
    const body = bodyOf(n);
    n.bodyEl.hidden = !body;
    n.bodyEl.textContent = body;
    // 最大行数（超えた分は … で切る。切ったときはポインタを乗せると全文が出る）。測るときの鍵にも使う（measure.ts）
    const lines = body ? bodyLinesOf(n) : 0;
    n.bodyEl.classList.toggle("mz-body-clamp", lines > 0);
    n.bodyEl.style.setProperty("-webkit-line-clamp", lines ? String(lines) : "");
    if (lines) n.bodyEl.dataset.lines = String(lines); else delete n.bodyEl.dataset.lines;
    n.bodyEl.title = lines ? body : "";
    n.gripEl.hidden = !body;
    head.classList.toggle("mz-has-body", !!body);
    head.classList.toggle("mz-body-norule", n.src.bodyRule === false);
    // 内包する箱・リストの親の本文は見出しの下に位置を決めて置き、それ以外は本体の中の流れに置く。大きさを測る前に切り替える
    // （描くときに切り替えると、ツリーに変えた直後に位置を決めたまま測り、本文の分の高さが入らない。測った結果も使い回される）
    const block = !!body && (group || (view === "list" && n.children.length > 0));
    n.bodyEl.classList.toggle("mz-body-block", block);
    const bs = n.bodyEl.style;
    bs.position = block ? "absolute" : "";
    bs.left = block ? opt.padding + "px" : "";
    bs.top = block ? opt.header + "px" : "";
    if (!block) bs.width = "";

    n.moreEl.hidden = !(n.children.length && view === "hidden");
    n.moreEl.title = `子 ${n.children.length} 件`;
    n.treeSvg.style.display = n.children.length && view === "tree" ? "" : "none";
    // 色の指定が無ければ線と同じ色にする（白だと明るいテーマで見えないため）
    n.treeFrame.style.stroke = own ? `color-mix(in srgb, ${color} 55%, transparent)` : "var(--mz-edge)";
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

  // ひし形: 上下左右の辺の真ん中を頂点にする（線は頂点にだけつながる。routing.ts の aVertex / bVertex）
  function renderDiamond(n: Box) {
    const x0 = 1, x1 = n.hw - 1, y0 = 1, y1 = n.hh - 1, cx = n.hw / 2, cy = n.hh / 2;
    n.shapeSvg.firstElementChild?.setAttribute("points", `${cx},${y0} ${x1},${cy} ${cx},${y1} ${x0},${cy}`);
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

  type Abs = { x: number; y: number; w: number; h: number };
  type Pt = [number, number];

  // 線が通ってほしくない箱: 同じ親を持つ、見えている箱（枠ごと。子孫はその中に入っている）。親ごとに一度だけ作る
  function siblingFrames() {
    const frames = new Map<Box | null, { n: Box; r: Abs }[]>();
    return (p: Box | null) => {
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
  }

  // 線の道筋を決める入力（routing.ts）。ほかの箱は、道筋に関わりうるものだけに絞る（scopeObstacles）
  function routeInputOf(e: Edge, siblingsOf = siblingFrames()): RouteInput {
    const [ax, ay] = absPos(e.a);
    const [bx, by] = absPos(e.b);
    const ra = anchorRect(e.a), rb = anchorRect(e.b);
    const obstacles = siblingsOf(e.a.parent).filter(o => o.n !== e.a && o.n !== e.b).map(o => o.r);
    const input: RouteInput = {
      a: { x: ax + ra.x, y: ay + ra.y, w: ra.w, h: ra.h },
      b: { x: bx + rb.x, y: by + rb.y, w: rb.w, h: rb.h },
      elbow: routeOf(e, ctx.world) === "elbow",
      via: viaOf(e),
      obstacles, margin: BEND_MARGIN,
      exitAt: typeof e.src.exitAt === "number" ? e.src.exitAt : null,
      enterAt: typeof e.src.enterAt === "number" ? e.src.enterAt : null,
      aVertex: shapeOf(e.a) === "diamond", bVertex: shapeOf(e.b) === "diamond",
      memory: e.memory,
    };
    input.obstacles = scopeObstacles(input);
    return input;
  }

  // 線は本体（ツリーなら外枠）どうしを結ぶ。非表示の子や、ツリーの子同士の線は描かない（データには残す）
  function renderEdges() {
    const siblingsOf = siblingFrames();
    const loops: Edge[] = []; // 自分に戻る線（ほかの線を描いてから、空いている角に描く）
    for (const e of ctx.edges()) {
      const hidden = edgeHidden(e);
      e.el.style.display = hidden ? "none" : "";
      if (hidden) continue;
      if (e.a === e.b) { loops.push(e); continue; }
      // 道筋は入力だけで決まる（routing.ts は純粋な関数）ので、入力が前と同じなら前の結果を使い回す。
      // ほかの箱は、道筋に関わりうるものだけに絞ってある（ドラッグ中に、離れた所で動いている箱のために探し直さない）
      const input = routeInputOf(e, siblingsOf);
      const key = JSON.stringify(input);
      const r = e.routeMemo?.key === key ? e.routeMemo.route : route(input);
      e.routeMemo = Object.keys(r.fix).length ? null : { key, route: r };
      const pts = r.points;
      e.points = pts;
      e.shape = r.shape;
      e.segments = r.segments;
      e.arrangement = r.arrangement;
      e.ends = r.arrangement === "overlap" ? null : r.ends;
      e.memory = r.memory;
      // データに書き戻すこと（引けなくなった via を消す、以前の持ち方を消す）は graph に任せる
      const fix = "exit" in e.src || "enter" in e.src || "bend" in e.src ? { ...r.fix, clearLegacy: true } : r.fix;
      if (Object.keys(fix).length) ctx.fixEdge(e, fix);
      renderHandles(e);
      // 線の両端をつかむ丸（線を選んでいるときだけ CSS で出す）
      e.endsEl.style.display = e.ends ? "" : "none";
      if (e.ends) {
        const [s, t] = [pts[0]!, pts[pts.length - 1]!];
        const [c1, c2] = e.endsEl.children as unknown as SVGCircleElement[];
        c1!.setAttribute("cx", String(s[0])); c1!.setAttribute("cy", String(s[1]));
        c2!.setAttribute("cx", String(t[0])); c2!.setAttribute("cy", String(t[1]));
      }
      paint(e);
    }
    // 自分に戻る線（docs/SELFLOOP-plan.md）。道筋の計算は通さず、2 つの端を通る円の弧を箱の外に描く。端の位置の指定が
    // 無ければ、ほかの箱やほかの線とぶつからない角に描く（同じ箱の 2 本目以降は輪を大きくする）。動かせる区間は無い
    const count = new Map<Box, number>();
    for (const e of loops) {
      const index = count.get(e.a) ?? 0;
      count.set(e.a, index + 1);
      const { r, boxes, lines } = loopInputOf(e, siblingsOf);
      const at = {
        exit: typeof e.src.exitAt === "number" ? e.src.exitAt : null,
        enter: typeof e.src.enterAt === "number" ? e.src.enterAt : null,
      };
      const loop = selfLoop(r, boxes, index, lines, at);
      e.points = loop.points;
      e.shape = null;
      e.segments = [];
      // 端は、もう一方の端の辺とその両隣の上を動かせる（端の位置は、箱のふちを一周した割合。selfloop.ts）
      e.ends = { exit: loop.ends.exit, enter: loop.ends.enter };
      e.routeMemo = null;
      renderHandles(e);
      e.endsEl.style.display = "";
      const [c1, c2] = e.endsEl.children as unknown as SVGCircleElement[];
      const [s, t] = [e.points[0]!, e.points[e.points.length - 1]!];
      c1!.setAttribute("cx", String(s[0])); c1!.setAttribute("cy", String(s[1]));
      c2!.setAttribute("cx", String(t[0])); c2!.setAttribute("cy", String(t[1]));
      paint(e);
    }
  }

  // 自分に戻る線の輪を描く箱（ワールドの座標）と、避けるほかの箱・線
  function loopInputOf(e: Edge, siblingsOf = siblingFrames()) {
    const [ax, ay] = absPos(e.a);
    const ra = anchorRect(e.a);
    const r = { x: ax + ra.x, y: ay + ra.y, w: ra.w, h: ra.h };
    const boxes = siblingsOf(e.a.parent).filter(o => o.n !== e.a).map(o => o.r);
    const lines = ctx.edges().filter(o => o !== e && o.a.parent === e.a.parent && o.el.style.display !== "none").map(o => o.points);
    return { r, boxes, lines };
  }

  // 描いたばかりの自分に戻る線を、点 p（ワールドの座標）に一番近い角に置くときの端の位置。
  // その角が自動で選ぶ角と同じか、ふさがっていれば null（自動のままでよい。docs/EDGE-TOOL-plan.md）
  function loopCornerNear(e: Edge, p: Pt): { exit: number; enter: number } | null {
    const { r, boxes, lines } = loopInputOf(e);
    const index = ctx.edges().filter(o => o.a === e.a && o.b === e.a && !edgeHidden(o)).indexOf(e);
    const corner = nearestCorner(r, p);
    if (index < 0 || selfLoop(r, boxes, index, lines).corner === corner) return null;
    return cornerAt(r, boxes, index, lines, corner);
  }

  // 線の見た目（点の並び e.points から、見える線・クリックを受ける線・矢印・破線）を整える
  function paint(e: Edge) {
    const pts = e.points;
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
    paintLabel(e);
  }

  const LABEL_MAX_W = 160, LABEL_MIN_W = 48, LABEL_MARGIN = 16, LABEL_BOX_H = 200;

  // 線のキャプションの札（docs/EDGE-CAPTION-plan.md）。線の長さの真ん中に置く。折り返す幅は、上限 160 と、
  // 線の長さ（箱のふちからふちまで）から余白を引いた幅の狭い方（箱どうしが近ければ縦に折り返して、箱にかぶらないように）。
  // ただし、真ん中の区間が縦向きの線と、自分に戻る線は狭めない（縦の線で箱とぶつかるのは札の高さなので、狭めると
  // 行が増えてかえってぶつかる。2026-10-09 ユーザー）。
  // foreignObject は幅を折り返しの幅にし、高さは十分に取って、中で札を真ん中にそろえる（札の大きさを測らずに済む）
  function paintLabel(e: Edge) {
    const caption = typeof e.src.caption === "string" ? e.src.caption.trim() : "";
    if (!caption || e.points.length < 2) {
      e.labelEl?.remove();
      e.labelEl = null;
      return;
    }
    if (!e.labelEl) {
      const fo = document.createElementNS(SVGNS, "foreignObject");
      fo.setAttribute("class", "mz-label");
      const box = document.createElement("div");
      box.className = "mz-label-box";
      box.appendChild(document.createElement("span"));
      fo.appendChild(box);
      e.el.appendChild(fo);
      e.labelEl = fo;
    }
    const pts = e.points;
    const len = polylineLength(pts);
    // 置く位置（手で動かしていれば captionAt と captionOffset、無ければ真ん中で線の上）と、そこの区間の向き
    const at = typeof e.src.captionAt === "number" ? e.src.captionAt : 0.5;
    const off = typeof e.src.captionOffset === "number" ? Math.max(-CAPTION_OFFSET_MAX, Math.min(CAPTION_OFFSET_MAX, e.src.captionOffset)) : 0;
    const [nx, ny] = leftNormalAt(pts, at);
    const vertical = Math.abs(nx) > Math.abs(ny); // 左の向きが横なら、区間は縦向き
    const w = e.a === e.b || vertical ? LABEL_MAX_W : Math.max(LABEL_MIN_W, Math.min(LABEL_MAX_W, len - LABEL_MARGIN));
    const [bx, by] = pointAt(pts, at);
    const [mx, my] = [bx + nx * off, by + ny * off];
    const fo = e.labelEl;
    fo.setAttribute("x", String(Math.round((mx - w / 2) * 10) / 10));
    fo.setAttribute("y", String(Math.round((my - LABEL_BOX_H / 2) * 10) / 10));
    fo.setAttribute("width", String(w));
    fo.setAttribute("height", String(LABEL_BOX_H));
    fo.querySelector("span")!.textContent = caption;
  }

  // 途中の区間をつかむ透明な線（選択モードでドラッグして動かす）。区間 i は、点の並びの i + 1 番目から i + 2 番目まで
  function renderHandles(e: Edge) {
    const g = e.handlesEl;
    while (g.childElementCount > e.segments.length) g.lastElementChild!.remove();
    while (g.childElementCount < e.segments.length) {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("class", "mz-bend");
      g.appendChild(l);
    }
    e.segments.forEach((seg, i) => {
      const l = g.children[i] as SVGLineElement;
      const p = e.points[seg.index + 1], q = e.points[seg.index + 2];
      l.style.display = p && q ? "" : "none";
      if (!p || !q) return;
      l.dataset.index = String(seg.index);
      l.setAttribute("x1", String(p[0])); l.setAttribute("y1", String(p[1]));
      l.setAttribute("x2", String(q[0])); l.setAttribute("y2", String(q[1]));
      l.classList.toggle("mz-bend-x", seg.axis === "x");
    });
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
      // 内包する箱・リストの親の本文は、見出しの下に置く。幅は箱の幅いっぱいか、つまみで変えた幅（箱の幅まで）。
      // 子の無い箱では本体の中の流れに任せる
      const block = n.bodyEl.classList.contains("mz-body-block") && !n.bodyEl.hidden;
      const bw = block ? bodyWrapW(n, n.hw) - 2 * opt.padding : 0;
      if (block) n.bodyEl.style.width = bw + "px";
      // つまみ: 子の無い箱は本体の右の縁（高さいっぱい）、内包する箱は本文の右の縁
      const g = n.gripEl.style;
      g.left = block ? opt.padding + bw - 3 + "px" : "";
      g.right = block ? "auto" : "";
      g.top = block ? opt.header + "px" : "";
      g.height = block ? n.bodyH + "px" : "";
      if (shapeOf(n) === "db") renderDb(n);
      if (shapeOf(n) === "diamond") renderDiamond(n);
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

  // 線を一番手前に描く（線は不透明なので、重なった区間では後に描いた線が上になる）。選んでいる線は、いつもその上
  // 並びがもう望みどおりなら動かさない（ポインタを乗せている要素を動かすと、乗せ直したことになって pointerenter がまた来るため）
  function toFront(list: Edge[]) {
    const sel = ctx.edges().find(e => e.el.classList.contains("mz-selected"));
    const order = [...list.filter(e => e !== sel), ...(sel ? [sel] : [])].map(e => e.el);
    const parent = order[0]?.parentNode;
    if (!parent) return;
    const tail = [...parent.children].filter(c => c.classList.contains("mz-edge")).slice(-order.length);
    if (tail.length === order.length && tail.every((c, i) => c === order[i])) return;
    for (const el of order) parent.appendChild(el);
  }

  // ---- フォーカス（Obsidian 風: 関係の無いものを薄くする） ----

  // 描かない線: 端の箱が隠れている（非表示の親の中）か、ツリー・リストの子どうし（子は自動で並ぶので、線を引くと形が崩れる）
  function edgeHidden(e: Edge) {
    return isHidden(e.a) || isHidden(e.b) || inTree(e.a) || inList(e.a);
  }

  // ポインタを乗せた箱と、線でつながった相手を明るくし、ほかを暗くする。描いていない線はたどらない
  // （見えない線の相手まで明るくなると、なぜ明るいのか分からないため）
  function focus(n: Box) {
    const near = new Set([n, ...descendants(n)]);
    const hi: Edge[] = [];
    for (const e of ctx.edges()) {
      const on = (e.a === n || e.b === n) && !edgeHidden(e);
      if (on) { near.add(e.a); near.add(e.b); hi.push(e); }
      e.el.classList.toggle("mz-hi", on);
      e.el.classList.toggle("mz-dim", !on);
    }
    toFront(hi);
    for (const m of [...near]) ancestors(m).forEach(p => near.add(p));
    for (const o of ctx.nodes()) o.el.classList.toggle("mz-dim", !near.has(o));
  }

  function unfocus() {
    for (const e of ctx.edges()) e.el.classList.remove("mz-hi", "mz-dim");
    for (const o of ctx.nodes()) o.el.classList.remove("mz-dim");
  }

  return { applyWorldStyle, applyStyle, renderDb, renderTree, renderEdges, render, blocked, focus, unfocus, toFront, routeInputOf, loopCornerNear };
}
