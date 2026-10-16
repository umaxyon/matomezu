// 描画: ボックスの見た目、DB やツリーの線、ボックスどうしの線を DOM に反映する

import { attrText, attrsOf, classEnd, opText, opsOf } from "./classbox";
import { headDraw, headOf } from "./heads";
import { SVGNS, esc, isLightColor } from "./dom";
import { t } from "./i18n";
import { THEMES, isTheme, setThemeVars, type Theme } from "./theme";
import type { Layout } from "./layout/layout";
import { leftNormalAt, pointAt, polylineLength } from "./geom";
import { fewestRoute, perimeterAt, route, routeOnSides, scopeObstacles, sideAt } from "./routing";
import { cornerAt, nearestCorner, perimeter, selfLoop } from "./selfloop";
import type { Route, RouteFix, RouteInput, Side } from "./routing";
import {
  type Box, type Edge, type World, abilitiesOf, absPos, ancestors, arrangeOf, BEND_MARGIN, bodyLinesOf, bodyOf, bodyWrapW, borderOf,
  captionOf, dashOf, descendants, displayCaption, fillOf, hidesKids, inTreeOf, isHidden, linkIconOf, linkLookOf, listPreviewOf, isIconShape, isNesting, overflowOf, routeOf, shapeOf,
  sizeOf, slantOf, treeLinesOf, vertexOnly, viaOf, kidStrategyOf, splitBranches, type Vertex,
} from "./model";
import { OVERFLOWS, PATTERN_LABELS, SHAPES, SIZES } from "./validate";
import { shapeDef } from "./shapes";
import { LINK_ICON_DEF, LINK_LOOKS, LINK_LOOK_DEFS, PREVIEW_ROW_DEF, type Rect, previewRegion, windowOf } from "./link-box";
import { type Scene, drawScene } from "./preview-art";
import type { LinkLook, PagePattern } from "./types";
import { SHAPE_ART } from "./shape-art";

export interface RenderContext {
  opt: { color: string; header: number; treeGapY: number; padding: number; previewMinScale: number };
  world: World;
  worldEl: HTMLElement;
  nodes(): Box[];
  edges(): Edge[];
  fixEdge(e: Edge, fix: RouteFix): void; // 線の道筋を決めたときに分かった、データに書き戻すこと（graph が直す）
  dragging(): boolean; // 箱か線をドラッグしている間か（フローチャートの線は、その間だけ前に描いた辺を保つ）
  themeOf(n: Box | null): Theme; // 箱（null はワールド）に効いているテーマ
  paintOf(n: Box): { color: string; own: boolean }; // 箱を塗る色と、それがデータの color から来たか（テーマと色の名前を解いたもの）
  backgroundOf(): string | null; // 図の背景の色（world.background とテーマから。無ければ null）
  linkOf(n: Box): { page: string; pageName: string; pattern: PagePattern; look: LinkLook; clip: Rect | null; book: string | null } | null; // リンクの箱がのぞくページ（link-box.ts）。マスターの窓なら book。でなければ null
  sceneOf(n: Box): Scene; // 窓に映す縮図のもと（リンクの箱はのぞくページ、マスターの窓はそのブックの最初のページ。preview-art.ts）
}

export type Renderer = ReturnType<typeof createRenderer>;

// 付箋の折り返しの大きさ（px。graph-style.ts の .mz-style-sticky::after と合わせる）
const FOLD = 12;
// 枠を引く箱（border）の枠の線の太さ（px）。スクロールするリストの中身は、この内側に収める（scrollKids）
const FRAME_W = 2;

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
    const arrange = arrangeOf(n);
    const size = sizeOf(n);
    const fill = fillOf(n);

    head.classList.toggle("mz-group", group);
    head.classList.toggle("mz-leaf", !group);
    for (const s of Object.keys(SIZES)) head.classList.toggle("mz-size-" + s, s === size);
    // 文字の扱いは子を持たないボックスだけが overflow に従う（S は固定の大きさの中で折り返す）
    const textOv = n.children.length || size === "S" || isIconShape(shapeOf(n)) ? "wrap" : overflowOf(n);
    for (const ov of OVERFLOWS) head.classList.toggle("mz-ov-" + ov, !group && textOv === ov);

    const shape = shapeOf(n);
    const draw = shapeDef(shape).draw; // 描き方（形の表 shapes.ts）
    // 見た目の補正値（テーマとサイズから。ノーマルの形だけ。docs/LAYOUT-BASE-plan.md）。箱の中の余白に足して描き（graph-style.ts の
    // --mz-out-x / --mz-out-y）、配置はこれを足した大きさ（足跡）で決まる。値が変わったら（テーマやサイズを変えた）、土台の位置を保つよう
    // 足跡の左上を差の分だけずらす（四方に均等に膨らむので、中心は動かない）。位置を受け渡す入口はここだけ
    const [oy, ox] = !group && shapeDef(shape).kind === "normal" ? theme.outset?.[size] ?? [0, 0] : [0, 0];
    head.style.setProperty("--mz-out-y", oy + "px");
    head.style.setProperty("--mz-out-x", ox + "px");
    // 形の数値（形の表 shapes.ts）を CSS へ渡す: 斜めの辺の食い込み（文字の左右の余白に足す）と、文字を折り返す幅の割合（ひし形・円）
    head.style.setProperty("--mz-slant", slantOf(n) + "px");
    const fit = shapeDef(shape).fit;
    if (fit) head.style.setProperty("--mz-text-ratio", String(fit.ratio)); else head.style.removeProperty("--mz-text-ratio");
    const was = n.out;
    n.out = { x: ox, y: oy };
    if (was && n.hasPos && (was.x !== ox || was.y !== oy)) {
      n.x -= ox - was.x;
      n.y -= oy - was.y;
      n.intendedY -= oy - was.y;
    }
    for (const sh of SHAPES) head.classList.toggle("mz-shape-" + sh, sh === shape);
    // 絵の形は、形の表の大きさの絵（shape-art.ts）の足元に文字を置く（graph-style.ts の .mz-icon）
    const art = shapeDef(shape).art;
    head.classList.toggle("mz-icon", !!art);
    if (art) {
      head.style.setProperty("--mz-art-w", art.w * art.scale[size] + "px");
      head.style.setProperty("--mz-art-h", art.h * art.scale[size] + "px");
    }
    // 文字を塗りの上に書くのは、ボックスと DB（塗りつぶしあり）だけ
    const onFill = !group && fill && !isIconShape(shape);
    const light = onFill && isLightColor(color);
    head.classList.toggle("mz-dark", onFill && light);
    head.classList.toggle("mz-light", onFill && !light);
    // テーマの文字の色は明るい塗りの上だけ（色を書いた暗い箱は、塗りの明るさで白い文字にする）
    head.style.color = onFill && theme.text && light ? theme.text : "";
    const edge = theme.border ?? `color-mix(in srgb, ${color} 70%, #000)`;
    const shadowOf = () => (theme.shadow === "none" ? null : theme.shadow ?? "var(--mz-shadow)");
    // 付箋（テーマのスタイル）: 右上の角を切り欠き、折り返しの三角を重ねる（graph-style.ts の .mz-style-sticky）。
    // 影は切り欠きに沿うよう、box-shadow ではなく drop-shadow で付ける
    const folded = theme.style === "sticky" && draw === "box" && !group && fill;
    head.classList.toggle("mz-style-sticky", folded);
    head.style.filter = folded && shadowOf() ? `drop-shadow(${shadowOf()})` : "";
    if (folded) head.style.setProperty("--mz-fold", `color-mix(in srgb, ${color} 70%, #6b5a2a)`);
    else head.style.removeProperty("--mz-fold");
    // クラスの箱も、ボックスと同じ背景と影（枠はいつも引く。UML の区画を見せるため）
    if (draw === "box" || draw === "class") {
      head.style.background = !fill ? "transparent"
        : group ? `color-mix(in srgb, ${color} 16%, transparent)`
        // 斜めのグラデーションの長さは角からの距離なので、切り欠きの 1 辺を折り返しの三角（FOLD）にそろえるには FOLD / √2。
        // FOLD のままだと切り欠きが 1 辺 17px になり、三角との間に背景が切れ込みのように見えていた（2026-10-11 ユーザー）
        : folded ? `linear-gradient(225deg, transparent ${FOLD / Math.SQRT2}px, ${color} 0)` : color;
      const shadow: string[] = [];
      // 塗りの無い文字の箱の枠は、箱の色で引く（テーマが箱ごとの色を使わないなら、テーマの枠の色。白い箱の色だと見えないため）
      const frame = group ? color : !fill ? (own || !theme.border ? color : theme.border) : edge;
      if (draw === "class") shadow.push(`inset 0 0 0 1.5px ${fill ? edge : color}`);
      else if (borderOf(n)) shadow.push(`inset 0 0 0 ${FRAME_W}px ${frame}`);
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
      if (art) {
        svg.setAttribute("viewBox", `0 0 ${art.w} ${art.h}`);
        svg.innerHTML = SHAPE_ART[shape] ?? "";
      }
      if (draw === "person") {
        // 色の指定が無ければ文字の色で描く（白だと明るいテーマで見えないため）
        svg.style.stroke = own ? color : "var(--mz-text)";
        svg.style.fill = "";
        setShadow(n, null);
      } else if (draw === "outline") {
        // 円・六角形・平行四辺形・台形。輪郭は renderOutline で大きさに合わせて描く（ひし形と同じ塗り方）
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<path class="mz-outline-body"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = fill ? edge : color;
        svg.style.strokeWidth = "1.5";
        setShadow(n, fill ? shadowOf() : null);
      } else if (draw === "diamond") {
        // ひし形。頂点は renderDiamond で大きさに合わせて置く
        svg.removeAttribute("viewBox");
        svg.innerHTML = '<polygon class="mz-diamond-body"/>';
        svg.style.fill = fill ? color : "none";
        svg.style.stroke = fill ? edge : color;
        svg.style.strokeWidth = "1.5";
        setShadow(n, fill ? shadowOf() : null);
      } else {
        // 絵の形（DB・サーバー・パソコンなど。shape-art.ts）。スティックマンと同じく絵の大きさは決まっていて、文字は足元に置く。
        // 部品の役割で塗り分ける: 本体は箱の色、明るい所（上面・光）と暗い所（側面・台座）は箱の色から作り、印は線の色。
        // 塗りが無ければ輪郭だけ（印は箱の色で塗る）
        svg.style.fill = "";
        svg.style.stroke = fill ? edge : color;
        svg.style.strokeWidth = "1.3";
        const paints: [string, string][] = [
          ["mz-art-body", color], ["mz-art-light", `color-mix(in srgb, ${color} 60%, #fff)`],
          ["mz-art-dark", `color-mix(in srgb, ${color} 70%, #000)`], ["mz-art-line", "none"],
        ];
        for (const [cls, paint] of paints) {
          for (const el of svg.querySelectorAll<SVGElement>("." + cls)) el.style.fill = fill ? paint : "none";
        }
        for (const el of svg.querySelectorAll<SVGElement>(".mz-art-dot")) el.style.fill = fill ? edge : color;
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
    // クラスの箱（docs/CLASS-plan.md）: キャプション（クラス名）の下に、属性と操作の区画
    const isClass = draw === "class";
    n.classEl.hidden = !isClass;
    head.classList.toggle("mz-class-abstract", isClass && n.src.abstract === true);
    if (isClass) n.classEl.innerHTML = classHtml(n.src);
    else if (n.classEl.firstChild) n.classEl.replaceChildren();
    n.gripEl.hidden = !body;
    n.widthGripEl.hidden = !abilitiesOf(n).widthGrip;
    n.heightGripEl.hidden = !abilitiesOf(n).heightGrip;
    head.classList.toggle("mz-has-body", !!body);
    head.classList.toggle("mz-body-norule", n.src.bodyRule === false);
    // 内包する箱・リストの親の本文は見出しの下に位置を決めて置き、それ以外は本体の中の流れに置く。大きさを測る前に切り替える
    // （描くときに切り替えると、ツリーに変えた直後に位置を決めたまま測り、本文の分の高さが入らない。測った結果も使い回される）
    const block = !!body && group;
    n.bodyEl.classList.toggle("mz-body-block", block);
    const bs = n.bodyEl.style;
    bs.position = block ? "absolute" : "";
    bs.left = block ? opt.padding + "px" : "";
    bs.top = block ? opt.header + "px" : "";
    if (!block) bs.width = "";

    // リンクの箱（link-box.ts）: 持ち手の帯と窓を出し、見せ方の数値を CSS の変数で渡す。札はのぞくページのパターン、窓はそのページの名前。
    // リストの子が子を持つときも、同じ部品で横に中身の縮図を出す（row。D13）。持ち手と札は無く、縮図は押しても開かない。
    // リストの中の縮図は、文字が増えて行が高くなったら上下の真ん中に置く（mz-link-mid。2026-10-14 ユーザー）
    const link = ctx.linkOf(n);
    const side = listPreviewOf(n);
    const row = !link && side != null;
    const look: LinkLook | null = link ? linkLookOf(n) : row ? "side" : null; // 描く形（縮図を出さない見せ方も、横に分ける形で描く）
    head.classList.toggle("mz-link", !!look);
    for (const l of LINK_LOOKS) head.classList.toggle("mz-link-" + l, look === l);
    head.classList.toggle("mz-link-row", row);
    head.classList.toggle("mz-link-book", !!link?.book); // ブックリンクは持ち手を縞にして、ページリンクと見分ける（D29。テーマに左右されない所）
    head.classList.toggle("mz-link-left", side === "left");
    const icon = !!link && linkIconOf(n); // 縮図を出さないリストの中の窓は、縮図の代わりに開くアイコン
    head.classList.toggle("mz-link-icon", icon);
    head.classList.toggle("mz-link-mid", side != null || icon);
    head.classList.toggle("mz-link-empty", !!look && !caption && !body);
    n.linkEl.hidden = !look;
    // 文字は、リンクの箱のときだけ入れる（偽の測り方（テスト）は本体の文字を数えるため、リンクでない箱に残さない）
    n.linkBadge.textContent = link ? PATTERN_LABELS[link.pattern] : "";
    n.linkWin.querySelector(".mz-link-go")!.textContent = link && !linkIconOf(n) ? t("開く ↗") : "";
    if (look) {
      const d = row ? PREVIEW_ROW_DEF : icon ? LINK_ICON_DEF : LINK_LOOK_DEFS[look];
      head.style.setProperty("--mz-link-handle", d.handle + "px");
      head.style.setProperty("--mz-link-win-w", d.win.w + "px");
      head.style.setProperty("--mz-link-win-h", d.win.h + "px");
      head.style.setProperty("--mz-link-gap", d.gap + "px");
      n.linkWin.title = !link ? t("中身の縮図") : link.book ? t("押すと「{name}」を開きます", { name: link.pageName }) : t("押すと「{name}」のページを開きます", { name: link.pageName });
      // 窓にそのページの縮図を映す（縮尺と切り取りは link-box.ts の previewRegion。窓の幅は、窓枠なら箱の幅から余白を引いたもの）
      if (icon) n.linkArt.replaceChildren();
      else {
        const scene = ctx.sceneOf(n);
        drawScene(n.linkArt, scene, previewRegion(scene, windowOf(d), opt.previewMinScale, link?.clip ?? null));
      }
    } else if (n.linkArt.firstChild) n.linkArt.replaceChildren();
    n.moreEl.hidden = arrange !== "hidden";
    n.moreEl.title = t("子 {n} 件", { n: n.children.length });
    n.treeSvg.style.display = arrange === "tree" ? "" : "none";
    // 枠はツリーの根だけ（中の節は線だけ。docs/PATTERN-plan.md の 3.6 章）
    n.treeFrame.style.display = arrange === "tree" && !inTreeOf(n) ? "" : "none";
    // 色の指定が無ければ線と同じ色にする（白だと明るいテーマで見えないため）
    n.treeFrame.style.stroke = own ? `color-mix(in srgb, ${color} 55%, transparent)` : "var(--mz-edge)";
    n.treeFrame.style.fill = `color-mix(in srgb, ${color} 5%, transparent)`;
    for (const k of n.children) k.el.style.display = hidesKids(n) ? "none" : "";
  }

  // クラスの箱の属性と操作の区画。行は data-member に名前を持つ（〇を出す位置と、線を落とした行を見つけるため）
  function classHtml(src: Box["src"]): string {
    const row = (name: string, text: string, cls: string) =>
      `<div class="mz-class-row${cls}" data-member="${esc(name)}">${esc(text)}</div>`;
    const attrs = attrsOf(src).map(a => row(a.name, attrText(a), a.static ? " mz-static" : "")).join("");
    const ops = opsOf(src).map(o => row(o.name, opText(o), (o.static ? " mz-static" : "") + (o.abstract ? " mz-abstract" : ""))).join("");
    return `<div class="mz-class-sec">${attrs}</div><div class="mz-class-sec">${ops}</div>`;
  }

  // 円・角丸（スタジアム）・六角形・平行四辺形・台形の輪郭（大きさに合わせて描く。斜めの辺の食い込みは model.ts の slantOf）
  function renderOutline(n: Box) {
    const x0 = 1, x1 = n.hw - 1, y0 = 1, y1 = n.hh - 1, cy = n.hh / 2, k = slantOf(n);
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, cx = n.hw / 2;
    const d = {
      circle: `M${cx},${y0}A${rx},${ry} 0 1 1 ${cx},${y1}A${rx},${ry} 0 1 1 ${cx},${y0}Z`,
      hexagon: `M${x0 + k},${y0}H${x1 - k}L${x1},${cy}L${x1 - k},${y1}H${x0 + k}L${x0},${cy}Z`,
      stadium: `M${x0 + ry},${y0}H${x1 - ry}A${ry},${ry} 0 0 1 ${x1 - ry},${y1}H${x0 + ry}A${ry},${ry} 0 0 1 ${x0 + ry},${y0}Z`,
      parallelogram: `M${x0 + k},${y0}H${x1}L${x1 - k},${y1}H${x0}Z`,
      parallelogramAlt: `M${x0},${y0}H${x1 - k}L${x1},${y1}H${x0 + k}Z`,
      trapezoid: `M${x0 + k},${y0}H${x1 - k}L${x1},${y1}H${x0}Z`,
      trapezoidAlt: `M${x0},${y0}H${x1}L${x1 - k},${y1}H${x0 + k}Z`,
    }[shapeOf(n) as "circle"];
    n.shapeSvg.firstElementChild?.setAttribute("d", d);
  }

  // ひし形: 上下左右の辺の真ん中を頂点にする（線は頂点にだけつながる。routing.ts の aVertex / bVertex）
  function renderDiamond(n: Box) {
    const x0 = 1, x1 = n.hw - 1, y0 = 1, y1 = n.hh - 1, cx = n.hw / 2, cy = n.hh / 2;
    n.shapeSvg.firstElementChild?.setAttribute("points", `${cx},${y0} ${x1},${cy} ${cx},${y1} ${x0},${cy}`);
  }

  // ツリーの折れ線: 親から1本下ろし、横に分けて各子の上へつなぐ
  function renderTree(n: Box) {
    if (arrangeOf(n) !== "tree") return;
    n.treeSvg.setAttribute("width", String(n.w));
    n.treeSvg.setAttribute("height", String(n.h));
    const d = treeLinesOf(n, opt.treeGapY).map(([a, b]) => `M${a![0]},${a![1]}L${b![0]},${b![1]}`);
    n.treePath.setAttribute("d", d.join(""));
    const f = n.treeFrame;
    f.setAttribute("width", String(Math.max(0, n.w - 1.5)));
    f.setAttribute("height", String(Math.max(0, n.h - 1.5)));
  }

  type Abs = { x: number; y: number; w: number; h: number };
  type Rect4 = Abs;
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
      aVertex: vertexOnly(shapeOf(e.a)), bVertex: vertexOnly(shapeOf(e.b)),
      // 前に描いた辺の記憶（ちらつきを抑える）。フローチャートの線は、ドラッグしている間だけ使う（止まっているときは、いつも一番よい形。
      // 開いたときに、配置が決まる前に描いた辺が残らないように）
      memory: kidStrategyOf(e.a.parent ?? e.a.world).separateEnds && !ctx.dragging() ? null : e.memory,
    };
    // フローチャートの分岐から出る線は、向かい合う頂点に分けて出す（端を固定していない線だけ。データは書き換えない）
    if (input.exitAt == null) {
      const v = branchVertexOf(e);
      if (v) input.exitAt = perimeterAt(input.a, vertexPoint(input.a, v));
    }
    // クラスの端は、決まった接点に固定する（docs/CLASS-plan.md）。データの固定の位置があれば、一番近い接点として読む
    const pin = (n: Box, r: Rect4, other: Rect4, at: number | null, member: unknown) => {
      const near = at == null ? null : pointAt(perimeter(r), at);
      return perimeterAt(r, classEnd(r, n.src, typeof member === "string" ? member : undefined, other, near));
    };
    if (shapeDef(shapeOf(e.a)).draw === "class") input.exitAt = pin(e.a, input.a, input.b, input.exitAt ?? null, e.src.fromMember);
    if (shapeDef(shapeOf(e.b)).draw === "class") input.enterAt = pin(e.b, input.b, input.a, input.enterAt ?? null, e.src.toMember);
    input.obstacles = scopeObstacles(input);
    return input;
  }

  // フローチャートの線は、なるべく同じ位置につながない（2026-10-11 ユーザー。docs/PATTERN-plan.md の 3.7 章）。同じ箱の同じ点に入る線が
  // 2 本以上あれば、折れ目の少ない線（同じなら短い線）がその辺を取り、負けた線は、空いている辺のうち相手に背を向けていない辺で、
  // 折れ目の一番少ない道を探す（routing.ts の routeOnSides）。探せなければ、そのまま共有する。描くときだけ決め、端を固定した線は除く
  function separateEnds(list: { e: Edge; input: RouteInput; r: Route }[]) {
    const rimOf = (n: Box) => { const [x, y] = absPos(n), r = anchorRect(n); return { x: x + r.x, y: y + r.y, w: r.w, h: r.h }; };
    // 同じ箱の同じ辺に入り、端どうしが SAME_END px より近い線を 1 つの組にする（丸めで 1px ずれることがある）
    const SAME_END = 6;
    const bySide = new Map<string, typeof list>();
    for (const item of list) {
      const { e, r } = item;
      if (typeof e.src.enterAt === "number" || r.arrangement === "overlap" || !kidStrategyOf(e.b.parent ?? e.b.world).separateEnds) continue;
      const side = sideAt(rimOf(e.b), r.points[r.points.length - 1]!);
      if (!side) continue;
      const key = `${e.b.id}|${side}`;
      bySide.set(key, [...(bySide.get(key) ?? []), item]);
    }
    const groups: (typeof list)[] = [];
    for (const items of bySide.values()) {
      const endOf = (x: (typeof list)[number]) => x.r.points[x.r.points.length - 1]!;
      for (const item of items) {
        const g = groups.find(g => g[0]!.e.b === item.e.b && Math.hypot(endOf(g[0]!)[0] - endOf(item)[0], endOf(g[0]!)[1] - endOf(item)[1]) < SAME_END);
        if (g) g.push(item); else groups.push([item]);
      }
    }
    for (const group of groups) {
      if (group.length < 2) continue;
      const len = (r: Route) => r.points.slice(1).reduce((s, q, i) => s + Math.abs(q[0] - r.points[i]![0]) + Math.abs(q[1] - r.points[i]![1]), 0);
      group.sort((x, y) => x.r.bends - y.r.bends || len(x.r) - len(y.r));
      const box = group[0]!.e.b, rim = rimOf(box);
      // この箱の辺のうち、もう線がつながっている辺
      const used = new Set(list.flatMap(({ e, r }) => {
        const out: (Side | null)[] = [];
        if (e.b === box) out.push(sideAt(rim, r.points[r.points.length - 1]!));
        if (e.a === box) out.push(sideAt(rim, r.points[0]!));
        return out;
      }));
      for (const item of group.slice(1)) {
        // 相手に背を向けていない辺（相手が右上なら上と右。真上なら上と左右）
        const o = rimOf(item.e.a);
        const dx = o.x + o.w / 2 - (rim.x + rim.w / 2), dy = o.y + o.h / 2 - (rim.y + rim.h / 2);
        const facing = (["t", "r", "b", "l"] as Side[]).filter(s =>
          (s === "t" ? -dy : s === "b" ? dy : s === "l" ? -dx : dx) >= -0.5 && !used.has(s));
        const better = facing.length ? routeOnSides(item.input, "enter", facing) : null;
        if (!better) continue;
        item.r = better;
        used.add(sideAt(rim, better.points[better.points.length - 1]!));
      }
    }
  }

  // 分岐（ひし形）から出る線 e の頂点。分岐を並べる戦略が分けるときで、端を固定していない線が 2 本以上あるときだけ（無ければ null）。
  // 入ってくる線の頂点（相手の向きに一番近い頂点）は、空いていれば避ける
  function branchVertexOf(e: Edge): Vertex | null {
    const d = e.a;
    if (d === e.b || !shapeDef(shapeOf(d)).branch || !kidStrategyOf(d.parent ?? d.world).splitBranches) return null;
    const out = ctx.edges().filter(x => x.a === d && x.b !== d && typeof x.src.exitAt !== "number" && !edgeHidden(x));
    if (out.length < 2) return null;
    const c = (n: Box) => { const [x, y] = absPos(n), r = anchorRect(n); return [x + r.x + r.w / 2, y + r.y + r.h / 2] as const; };
    const [cx, cy] = c(d);
    const facing = (dx: number, dy: number): Vertex => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t");
    const avoid = ctx.edges().filter(x => x.b === d && x.a !== d && !edgeHidden(x)).map(x => { const [sx, sy] = c(x.a); return facing(sx - cx, sy - cy); });
    const vs = splitBranches(out.map(x => { const [tx, ty] = c(x.b); return [tx - cx, ty - cy]; }), avoid);
    return vs[out.indexOf(e)] ?? null;
  }
  const vertexPoint = (r: Rect4, v: Vertex): [number, number] =>
    v === "t" ? [r.x + r.w / 2, r.y] : v === "b" ? [r.x + r.w / 2, r.y + r.h] : v === "l" ? [r.x, r.y + r.h / 2] : [r.x + r.w, r.y + r.h / 2];

  // 線は本体（ツリーなら外枠）どうしを結ぶ。非表示の子や、ツリーの子同士の線は描かない（データには残す）
  function renderEdges() {
    const siblingsOf = siblingFrames();
    const loops: Edge[] = []; // 自分に戻る線（ほかの線を描いてから、空いている角に描く）
    const routed: { e: Edge; input: RouteInput; r: Route }[] = [];
    for (const e of ctx.edges()) {
      const hidden = edgeHidden(e);
      e.el.style.display = hidden ? "none" : "";
      if (hidden) continue;
      if (e.a === e.b) { loops.push(e); continue; }
      // 道筋は入力だけで決まる（routing.ts は純粋な関数）ので、入力が前と同じなら前の結果を使い回す。
      // ほかの箱は、道筋に関わりうるものだけに絞ってある（ドラッグ中に、離れた所で動いている箱のために探し直さない）
      const input = routeInputOf(e, siblingsOf);
      const key = JSON.stringify(input);
      // フローチャートの線は、折れ目の一番少ない形にする（いつもの自動の形は、斜めに並ぶ箱どうしを Z 字で結ぶため。2026-10-12 ユーザー）
      const r = e.routeMemo?.key === key ? e.routeMemo.route
        : kidStrategyOf(e.a.parent ?? e.a.world).separateEnds ? fewestRoute(input) ?? route(input) : route(input);
      e.routeMemo = Object.keys(r.fix).length ? null : { key, route: r };
      routed.push({ e, input, r });
    }
    separateEnds(routed);
    for (const { e, r } of routed) {
      const pts = r.points;
      e.points = pts;
      e.shape = r.shape;
      e.segments = r.segments;
      e.arrangement = r.arrangement;
      e.ends = r.arrangement === "overlap" ? null : r.ends;
      e.memory = r.memory;
      // データに書き戻すこと（引けなくなった via を消す）は graph に任せる
      if (Object.keys(r.fix).length) ctx.fixEdge(e, r.fix);
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
    // 端の形（heads.ts）。見える線は形の付け根で止める（線の太さで先端が四角く太って見えないように、白抜きの中を線が通らないように）。
    // クリックを受ける透明な線は端まで
    const [line, hit] = e.lines as [SVGPolylineElement, SVGPolylineElement];
    const shown = pts.map(p => [...p] as Pt);
    const n = pts.length;
    const hs = headOf(e.src, "start"), he = headOf(e.src, "end");
    const ds = hs && n >= 2 ? headDraw(hs, pts[1]!, pts[0]!) : null;
    const de = he && n >= 2 ? headDraw(he, pts[n - 2]!, pts[n - 1]!) : null;
    if (ds?.trim) shown[0] = toward(pts[0]!, pts[1]!, ds.trim);
    if (de?.trim) shown[n - 1] = toward(pts[n - 1]!, pts[n - 2]!, de.trim);
    setPoints(line, shown);
    setPoints(hit, pts);
    line.classList.toggle("mz-dashed", dashOf(e) === "dashed");
    e.arrowEl.setAttribute("d", (ds?.fill ?? "") + (de?.fill ?? ""));
    e.headLineEl.setAttribute("d", (ds?.stroke ?? "") + (de?.stroke ?? ""));
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

  // スクロールするリスト（D33。listHeight）: 中身が箱の高さを超えたリストだけ、見出しの下にスクロールする入れ物（kidsEl）を作り、
  // 子の要素をその中へ移す（子の位置は入れ物の上端から）。超えなくなったら子を箱へ戻して入れ物を外す
  function scrollKids() {
    for (const n of ctx.nodes()) {
      const scrolls = n.children.length > 0 && n.h < n.fullH - 0.5 && Number(n.src.listHeight) > 0;
      if (scrolls && !n.kidsEl) {
        n.kidsEl = document.createElement("div");
        n.kidsEl.className = "mz-list-kids";
        n.el.appendChild(n.kidsEl);
      }
      if (!n.kidsEl) continue;
      if (!scrolls) {
        for (const k of n.children) n.el.appendChild(k.el);
        n.kidsEl.remove();
        n.kidsEl = null;
        continue;
      }
      // 枠の線（FRAME_W）の上に中身が重ならないよう、下と右（スクロールバー）を枠の内側までにする
      n.kidsEl.style.top = n.kidsTop + "px";
      n.kidsEl.style.right = FRAME_W + "px";
      n.kidsEl.style.height = Math.max(0, n.h - n.kidsTop - FRAME_W) + "px";
      const space = n.kidsEl.querySelector<HTMLElement>(":scope > .mz-list-space") ?? n.kidsEl.appendChild(Object.assign(document.createElement("div"), { className: "mz-list-space" }));
      space.style.height = Math.max(0, n.fullH - n.kidsTop) + "px"; // スクロールできる高さ（子は絶対位置なので、広さは別に持たせる）
      for (const k of n.children) if (k.el.parentElement !== n.kidsEl) n.kidsEl.appendChild(k.el);
    }
  }

  function render() {
    scrollKids();
    for (const n of ctx.nodes()) {
      const s = n.el.style;
      s.left = n.x + "px";
      s.top = (n.parent?.kidsEl ? n.y - n.parent.kidsTop : n.y) + "px"; // スクロールするリストの子は、入れ物の上端から
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
      const draw = shapeDef(shapeOf(n)).draw;
      if (draw === "diamond") renderDiamond(n);
      if (draw === "outline") renderOutline(n);
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
    return isHidden(e.a) || isHidden(e.b) || !abilitiesOf(e.a).link;
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

  return { applyWorldStyle, applyStyle, renderTree, renderEdges, render, blocked, focus, unfocus, toFront, routeInputOf, loopCornerNear };
}
