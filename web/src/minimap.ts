// ミニマップ: 図の枠（stage）の右上に全体像を出す。今見えている範囲を四角で重ね、
// ドラッグやクリックで表示する範囲を動かせる（図の枠のスクロール位置を変えるだけ。図そのものには倍率を掛けない）。
//   setupMinimapToggle(button)   … ツールバーの開閉のボタン（全部の図で 1 つ。開いているかはブラウザが覚える）
//   createMinimap(stage, graph)  … stage は図の枠（.mz-stage。スクロールする要素）。ミニマップは stage の親に重ねて置く
// 閉じているときは、図の上に何も出さない。図が枠に収まっている（スクロールが要らない）ときは出さず、ボタンをオフに戻して押せなくする
// （箱を動かしてスクロールが無くなったときも。スクロールが戻っても、自動では開かない）。
// 幅は固定（WIDTH）で、図の幅が収まるように縮める（横長の図ほど小さくなる）。高さは縦横比に合わせ、
// 図の枠の高さの MAX_HEIGHT_RATIO を超える分はミニマップの中でスクロールする（スクロールバーは出さず、
// 見えている範囲の四角がいつもミニマップの中に見えるよう、自動でスクロールする。ホイールでも動かせる）。
// 描き直しは、図の要素の変化・スクロール・大きさの変化を見て、次の描画の前にまとめて 1 回。
// 下に倍率の帯（初めの位置・縮小・倍率・拡大。タブ行のボタンと同じ動き）を付ける。中身（minimapView）は右の長押しのミニマップと共有する

import { SVGNS, injectStyle, isLightColor } from "./dom";
import type { Graph } from "./graph";
import { make, sceneItems, sceneOf } from "./preview-art";
import { fromScroll, scrollWorldTo, visibleWorld } from "./viewport";
import { containsPoint } from "./geom";
import { t } from "./i18n";
import { zoomControls } from "./preview";

const WIDTH = 160;
const MAX_HEIGHT_RATIO = 0.5;
const STORE_KEY = "matomezu.minimap";
const STYLE_ID = "matomezu-minimap-style";
const CSS = `/* i18n-ok（CSS のコメント） */
.mz-minimap {
  box-sizing: border-box;
  border-radius: 6px; overflow: hidden; font-size: 11px;
  color: #d4d4d8; background: rgba(40, 40, 46, 0.88); border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); opacity: 0.85; transition: opacity 0.15s;
  --mm-edge: rgba(200, 200, 210, 0.55); --mm-box: #ffffff; --mm-view: rgba(196, 181, 253, 0.25); --mm-view-line: #c4b5fd;
}
.mz-minimap:hover { opacity: 1; }
.mz-minimap-corner { position: absolute; top: 8px; right: 20px; z-index: 20; }
/* 下の倍率の帯: 左に初めの位置、右に 縮小・倍率・拡大。背景は暗い色で、絵と分ける */
.mz-minimap-bar { display: flex; align-items: center; gap: 2px; padding: 3px 4px; background: #232328; color: #e4e4e7; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.mz-minimap-bar .mm-btn { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; }
.mz-minimap-bar .mm-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
.mz-minimap-bar .mm-btn:disabled { opacity: 0.35; cursor: default; }
.mz-minimap-bar .mm-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.mz-minimap-bar .mm-home { margin-right: auto; }
.mz-minimap-bar .mm-level { min-width: 38px; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; }
.mz-minimap[hidden] { display: none; }
.mz-minimap-body { max-height: var(--mm-max, 300px); overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
/* 中のスクロールバーは出さない（出すと幅が狭くなり、全体像の右端が切れる）。見えている範囲の四角が見えるよう、自動でスクロールする */
.mz-minimap-body::-webkit-scrollbar { display: none; }
.mz-minimap-body svg { display: block; cursor: pointer; touch-action: none; }
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

// 倍率の帯の絵（タブ行の －・＋・初めの位置のボタンと同じ。i18n-ok）
const ICON_HOME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
const ICON_IN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

// ミニマップの中身（全体像の絵と、下の倍率の帯）。タブ行のボタンで開く図の右上のものと、右の長押しで出すもの（mode-picker.ts）で共有する。
// width は絵の幅、maxHeight は絵の高さの上限（超える分はミニマップの中でスクロール）
export interface MinimapView {
  el: HTMLElement;
  draw(): void;    // 今の図の様子で描き直す
  destroy(): void; // 倍率の帯の知らせを外す（el は呼ぶ側が外す）
}
export function minimapView(stage: HTMLElement, graph: Graph, o: { width: number; maxHeight: () => number }): MinimapView {
  injectStyle(STYLE_ID, CSS);
  const el = document.createElement("div");
  el.className = "mz-minimap";
  el.style.width = `${o.width}px`;
  const body = document.createElement("div");
  body.className = "mz-minimap-body";
  const svg = document.createElementNS(SVGNS, "svg");
  body.appendChild(svg);
  el.append(body);
  let scale = 1;
  let origin = { x: 0, y: 0 }; // 絵の左上（ワールドの座標。ワールドをずらしている量の分だけ負になる。D32）

  // 下の帯: 初めの位置に戻す・縮小・倍率・拡大（タブ行の同じボタンと同じ動き。preview.ts の zoomControls）
  const zoom = zoomControls();
  let unwatch = () => {};
  if (zoom) {
    const bar = document.createElement("div");
    bar.className = "mz-minimap-bar";
    const btn = (cls: string, icon: string, label: string, run: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `mm-btn ${cls}`;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.innerHTML = icon;
      b.addEventListener("click", e => { e.stopPropagation(); run(); });
      return b;
    };
    const home = btn("mm-home", ICON_HOME, t("初めの位置に戻す（倍率も 100% に。Home キーでも）"), () => zoom.home());
    const out = btn("mm-out", ICON_OUT, t("縮小（Ctrl+ホイールでも）"), () => zoom.zoomOut());
    const level = document.createElement("span");
    level.className = "mm-level";
    const zin = btn("mm-in", ICON_IN, t("拡大（Ctrl+ホイールでも）"), () => zoom.zoomIn());
    const show = () => {
      const st = zoom.state();
      level.textContent = st.level;
      out.disabled = !st.canOut;
      zin.disabled = !st.canIn;
      home.disabled = !st.canHome;
    };
    bar.append(home, out, level, zin);
    el.append(bar);
    show();
    unwatch = zoom.onChange(show);
  }

  function draw() {
    const fullW = stage.scrollWidth, fullH = stage.scrollHeight;
    // 絵はワールドの座標で描く。スクロールできる広さ全体（周りの余白と倍率を含む。D32）を、ワールドの座標に直して映す
    const v = graph.view(), z = v.zoom;
    origin = { x: fromScroll(v, 0, "x"), y: fromScroll(v, 0, "y") };
    const spanW = fullW / z, spanH = fullH / z;
    // 幅は中に使える幅（枠線の分を除く）。図全体がちょうど収まる倍率にする
    const width = body.clientWidth || o.width;
    scale = width / Math.max(1, spanW);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(Math.max(1, Math.round(spanH * scale))));
    svg.setAttribute("viewBox", `${origin.x} ${origin.y} ${spanW} ${spanH}`);
    body.style.setProperty("--mm-max", `${Math.round(o.maxHeight())}px`);
    // ワールドの背景色（ページを見ているなら、そのページの背景）。絵の描き方は preview-art.ts（リンクの箱の窓と同じ）
    const info = graph.info(null);
    const bg = info.kind === "world" ? info.backgroundPaint : null; // テーマの背景も（リンクの箱の窓と同じ。付箋紙・シンプル）
    el.classList.toggle("mm-on-light", !!bg && isLightColor(bg));
    el.classList.toggle("mm-on-dark", !!bg && !isLightColor(bg));
    // 背景はワールドの範囲だけ（周りの余白には塗らない）
    const items: Element[] = sceneItems(sceneOf(graph.geometry(), bg), { x: 0, y: 0, w: (fullW - 2 * v.ox) / z, h: (fullH - 2 * v.oy) / z });
    // 見えている範囲の四角（ワールドの座標）。図の端と重なる辺も線が半分切れないよう、線の太さの半分（画面で 1px）だけ内へ寄せる
    const inset = 1 / scale;
    const seen = visibleWorld(stage, v);
    const x0 = Math.max(seen.x, origin.x + inset), y0 = Math.max(seen.y, origin.y + inset);
    const x1 = Math.min(seen.x + seen.w, origin.x + spanW - inset), y1 = Math.min(seen.y + seen.h, origin.y + spanH - inset);
    items.push(make("rect", "mm-view", { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }));
    svg.replaceChildren(...items);
    // 見えている範囲の四角が、ミニマップの中で見えるようにする
    const vy0 = (y0 - origin.y) * scale, vy1 = (y1 - origin.y) * scale;
    if (vy0 < body.scrollTop) body.scrollTop = vy0;
    else if (vy1 > body.scrollTop + body.clientHeight) body.scrollTop = vy1 - body.clientHeight;
  }

  // ミニマップの上の点（画面の座標）を、ワールドの座標にする
  const toWorld = (ev: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [origin.x + (ev.clientX - r.left) / scale, origin.y + (ev.clientY - r.top) / scale];
  };
  // 見えている範囲（ワールドの座標）と、表示する範囲の左上を (x, y)（ワールドの座標）にする（viewport.ts）
  const viewRect = () => visibleWorld(stage, graph.view());
  const scrollTo = (x: number, y: number) => scrollWorldTo(stage, graph.view(), x, y);

  let grab: { dx: number; dy: number; id: number } | null = null;
  svg.addEventListener("pointerdown", ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const [x, y] = toWorld(ev);
    let v = viewRect();
    const inView = containsPoint(v, x, y);
    // 見えている範囲の外を押したら、その点が真ん中に来るように飛んでから、そのままドラッグできる
    if (!inView) { scrollTo(x - v.w / 2, y - v.h / 2); v = viewRect(); }
    grab = { dx: x - v.x, dy: y - v.y, id: ev.pointerId };
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

  return { el, draw, destroy: () => unwatch() };
}

// 図の要素の変化（箱の移動、線、読み込み）、スクロール、大きさ、図の枠の表示の切り替え（タブ）を見て、次の描画の前にまとめて 1 回 f を呼ぶ。外す関数を返す
export function watchStage(stage: HTMLElement, f: () => void, also: Element[] = []): () => void {
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; f(); }); };
  const mo = new MutationObserver(schedule);
  mo.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "points", "hidden", "class"] });
  const ro = new ResizeObserver(schedule);
  ro.observe(stage);
  for (const e of also) ro.observe(e);
  stage.addEventListener("scroll", schedule, { passive: true });
  listeners.add(schedule);
  schedule();
  return () => {
    listeners.delete(schedule);
    mo.disconnect();
    ro.disconnect();
    stage.removeEventListener("scroll", schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}

// タブ行のボタンで開く、図の右上のミニマップ
export function createMinimap(stage: HTMLElement, graph: Graph): Minimap {
  const host = stage.parentElement!;
  const view = minimapView(stage, graph, { width: WIDTH, maxHeight: () => host.clientHeight * MAX_HEIGHT_RATIO });
  const el = view.el;
  el.classList.add("mz-minimap-corner");
  host.appendChild(el);
  const unwatch = watchStage(stage, () => {
    // 図が表示領域に収まっていないか。ワールドの周り（余白か、紙が小さいときに真ん中へ寄せた分。D32）は数えない
    const { ox, oy } = graph.view();
    const scrolls = stage.scrollWidth - 2 * ox > stage.clientWidth + 1 || stage.scrollHeight - 2 * oy > stage.clientHeight + 1;
    if (!stage.hidden) setAvailable(scrolls);
    el.hidden = stage.hidden || !open || !scrolls;
    if (!el.hidden) view.draw();
  }, [host]);
  return {
    destroy() {
      unwatch();
      view.destroy();
      el.remove();
    },
  };
}
