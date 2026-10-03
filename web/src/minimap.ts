// ミニマップ: 図の枠（stage）の右上に全体像を出す。今見えている範囲を四角で重ね、
// ドラッグやクリックで表示する範囲を動かせる（図の枠のスクロール位置を変えるだけ。図そのものには倍率を掛けない）。
//   setupMinimapToggle(button)   … ツールバーの開閉のボタン（全部の図で 1 つ。開いているかはブラウザが覚える）
//   createMinimap(stage, graph)  … stage は図の枠（.mz-stage。スクロールする要素）。ミニマップは stage の親に重ねて置く
// 閉じているときは、図の上に何も出さない。図が枠に収まっている（スクロールが要らない）ときは出さず、ボタンをオフに戻して押せなくする
// （箱を動かしてスクロールが無くなったときも。スクロールが戻っても、自動では開かない）。
// 幅は固定（WIDTH）で、図の幅が収まるように縮める（横長の図ほど小さくなる）。高さは縦横比に合わせ、
// 図の枠の高さの MAX_HEIGHT_RATIO を超える分はミニマップの中でスクロールする（スクロールバーは出さず、
// 見えている範囲の四角がいつもミニマップの中に見えるよう、自動でスクロールする。ホイールでも動かせる）。
// 描き直しは、図の要素の変化・スクロール・大きさの変化を見て、次の描画の前にまとめて 1 回

import { SVGNS, injectStyle, isLightColor } from "./dom";
import type { Graph } from "./graph";

const WIDTH = 160;
const MAX_HEIGHT_RATIO = 0.5;
const STORE_KEY = "matomezu.minimap";
const STYLE_ID = "matomezu-minimap-style";
const CSS = `
.mz-minimap {
  position: absolute; top: 8px; right: 20px; z-index: 20; width: ${WIDTH}px;
  border-radius: 6px; overflow: hidden; font-size: 11px;
  color: #d4d4d8; background: rgba(40, 40, 46, 0.88); border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); opacity: 0.85; transition: opacity 0.15s;
  --mm-edge: rgba(200, 200, 210, 0.55); --mm-box: #ffffff; --mm-view: rgba(196, 181, 253, 0.25); --mm-view-line: #c4b5fd;
}
.mz-minimap:hover { opacity: 1; }
.mz-minimap[hidden] { display: none; }
.mz-minimap-body { max-height: var(--mm-max, 300px); overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
/* 中のスクロールバーは出さない（出すと幅が狭くなり、全体像の右端が切れる）。見えている範囲の四角が見えるよう、自動でスクロールする */
.mz-minimap-body::-webkit-scrollbar { display: none; }
.mz-minimap svg { display: block; cursor: pointer; touch-action: none; }
.mz-minimap .mm-box { stroke: none; }
.mz-minimap .mm-bg { stroke: none; }
.mz-minimap .mm-group { fill: none; stroke-width: 1; }
.mz-minimap .mm-edge { fill: none; stroke: var(--mm-edge); stroke-width: 1; vector-effect: non-scaling-stroke; }
.mz-minimap .mm-view { fill: var(--mm-view); stroke: var(--mm-view-line); stroke-width: 1.5; vector-effect: non-scaling-stroke; cursor: move; }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-minimap {
    color: #3f3f46; background: rgba(255, 255, 255, 0.92); border-color: rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    --mm-edge: rgba(90, 90, 110, 0.55); --mm-box: #d4d4d8; --mm-view: rgba(109, 75, 216, 0.15); --mm-view-line: #6d4bd8;
  }
}
/* ワールドに背景色があれば、ミニマップも同じ背景にし、その明るさに合わせて線や箱の色を切り替える（graph-style.ts の .mz-on-light / .mz-on-dark と同じ考え）。
   アプリのテーマ（ライト）の指定より強くするため、最後に :root を付けて書く */
:root .mz-minimap.mm-on-light { --mm-edge: rgba(90, 90, 110, 0.6); --mm-box: #d4d4d8; --mm-view: rgba(109, 75, 216, 0.15); --mm-view-line: #6d4bd8; }
:root .mz-minimap.mm-on-dark { --mm-edge: rgba(200, 200, 210, 0.55); --mm-box: #ffffff; --mm-view: rgba(196, 181, 253, 0.25); --mm-view-line: #c4b5fd; }
`;

export interface Minimap { destroy(): void }

// 開いているか（全部の図で共通）。変わったら、それぞれのミニマップに知らせる
let open = false;
try { open = localStorage.getItem(STORE_KEY) === "open"; } catch { /* 覚えられなくても動く */ }
const listeners = new Set<() => void>();
let toggle: HTMLButtonElement | null = null;

function setOpen(v: boolean) {
  open = v;
  try { localStorage.setItem(STORE_KEY, open ? "open" : "closed"); } catch { /* 同上 */ }
  toggle?.setAttribute("aria-pressed", String(open));
  for (const f of listeners) f();
}

export function setupMinimapToggle(button: HTMLButtonElement): void {
  toggle = button;
  button.addEventListener("click", () => setOpen(!open));
  button.setAttribute("aria-pressed", String(open));
}

// 前に出ている図がスクロールするか。しなければボタンをオフに戻して押せなくする
function setAvailable(scrolls: boolean) {
  if (!toggle) return;
  toggle.disabled = !scrolls;
  if (!scrolls && open) setOpen(false);
}

export function createMinimap(stage: HTMLElement, graph: Graph): Minimap {
  injectStyle(STYLE_ID, CSS);
  const host = stage.parentElement!;
  const el = document.createElement("div");
  el.className = "mz-minimap";
  const body = document.createElement("div");
  body.className = "mz-minimap-body";
  const svg = document.createElementNS(SVGNS, "svg");
  body.appendChild(svg);
  el.append(body);
  host.appendChild(el);
  let scale = 1;

  let frame = 0;
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }

  function draw() {
    const fullW = stage.scrollWidth, fullH = stage.scrollHeight;
    const viewW = stage.clientWidth, viewH = stage.clientHeight;
    const scrolls = fullW > viewW + 1 || fullH > viewH + 1;
    if (!stage.hidden) setAvailable(scrolls);
    el.hidden = stage.hidden || !open || !scrolls;
    if (el.hidden) return;
    // 幅は中に使える幅（枠線の分を除く）。図全体がちょうど収まる倍率にする
    const width = body.clientWidth || WIDTH;
    scale = width / Math.max(1, fullW);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(Math.max(1, Math.round(fullH * scale))));
    svg.setAttribute("viewBox", `0 0 ${fullW} ${fullH}`);
    body.style.setProperty("--mm-max", `${Math.round(host.clientHeight * MAX_HEIGHT_RATIO)}px`);
    const g = graph.geometry();
    // 色はデータの値なので、文字列の HTML にせず要素の属性として入れる
    const make = (tag: string, cls: string, attrs: Record<string, string | number>) => {
      const x = document.createElementNS(SVGNS, tag);
      x.setAttribute("class", cls);
      for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, String(v));
      return x;
    };
    const items: Element[] = [];
    // ワールドの背景色（ページを見ているなら、そのページの背景）
    const info = graph.info(null);
    const bg = info.kind === "world" ? info.background : null;
    el.classList.toggle("mm-on-light", !!bg && isLightColor(bg));
    el.classList.toggle("mm-on-dark", !!bg && !isLightColor(bg));
    if (bg) {
      const r = make("rect", "mm-bg", { x: 0, y: 0, width: fullW, height: fullH });
      (r as SVGElement).style.setProperty("fill", bg);
      items.push(r);
    }
    for (const e of g.edges) items.push(make("polyline", "mm-edge", { points: e.points.map(p => p.join(",")).join(" ") }));
    // 子を持つ箱（内包・ツリー）は枠だけ、それ以外は塗る。親から先に描くので、子が上に来る
    for (const b of g.boxes) {
      const group = !!b.kids && b.view !== "hidden";
      const r = make("rect", group ? "mm-group" : "mm-box", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 });
      // 白（既定の色）は明るいテーマで背景に溶けるので、テーマに合わせた色にする
      if (b.color && !/^#?f{3}(f{3})?$/i.test(b.color)) (r as SVGElement).style.setProperty(group ? "stroke" : "fill", b.color);
      else (r as SVGElement).style.setProperty(group ? "stroke" : "fill", "var(--mm-box)");
      if (group) r.setAttribute("vector-effect", "non-scaling-stroke");
      items.push(r);
    }
    // 見えている範囲の四角。図の端と重なる辺も線が半分切れないよう、線の太さの半分（画面で 1px）だけ内へ寄せる
    const inset = 1 / scale;
    const x0 = Math.max(stage.scrollLeft, inset), y0 = Math.max(stage.scrollTop, inset);
    const x1 = Math.min(stage.scrollLeft + viewW, fullW - inset), y1 = Math.min(stage.scrollTop + viewH, fullH - inset);
    items.push(make("rect", "mm-view", { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }));
    svg.replaceChildren(...items);
    // 見えている範囲の四角が、ミニマップの中で見えるようにする
    const vy0 = y0 * scale, vy1 = y1 * scale;
    if (vy0 < body.scrollTop) body.scrollTop = vy0;
    else if (vy1 > body.scrollTop + body.clientHeight) body.scrollTop = vy1 - body.clientHeight;
  }

  // ミニマップの上の点（画面の座標）を、図の座標にする
  const toWorld = (ev: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [(ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale];
  };
  // 表示する範囲の左上を (x, y) にする（はみ出さないようにブラウザが収める）
  const scrollTo = (x: number, y: number) => stage.scrollTo({ left: x, top: y });

  let grab: { dx: number; dy: number; id: number } | null = null;
  svg.addEventListener("pointerdown", ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const [x, y] = toWorld(ev);
    const inView = x >= stage.scrollLeft && x <= stage.scrollLeft + stage.clientWidth &&
      y >= stage.scrollTop && y <= stage.scrollTop + stage.clientHeight;
    // 見えている範囲の外を押したら、その点が真ん中に来るように飛んでから、そのままドラッグできる
    if (!inView) scrollTo(x - stage.clientWidth / 2, y - stage.clientHeight / 2);
    grab = { dx: x - stage.scrollLeft, dy: y - stage.scrollTop, id: ev.pointerId };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", ev => {
    if (!grab || ev.pointerId !== grab.id) return;
    const [x, y] = toWorld(ev);
    scrollTo(x - grab.dx, y - grab.dy);
  });
  const release = (ev: PointerEvent) => { if (grab && ev.pointerId === grab.id) grab = null; };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);

  // 図の要素の変化（箱の移動、線、読み込み）、スクロール、大きさ、図の枠の表示の切り替え（タブ）を見て描き直す
  const mo = new MutationObserver(schedule);
  mo.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "points", "hidden", "class"] });
  const ro = new ResizeObserver(schedule);
  ro.observe(stage);
  ro.observe(host);
  stage.addEventListener("scroll", schedule, { passive: true });
  listeners.add(schedule);
  schedule();

  return {
    destroy() {
      listeners.delete(schedule);
      mo.disconnect();
      ro.disconnect();
      stage.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      el.remove();
    },
  };
}
