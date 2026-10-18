// 右の長押しで出すモードの切り替え（D39 の試し。2026-10-17 ユーザーと決めた形）:
// - 図の中で右ボタンを LONG_PRESS_MS 押し続けるか Space を押すと、ポインタのすぐ近くにモードのアイコン（選択・手のひら・付け替え）を並べて出す。
//   マウスのまま、今の位置からすぐ押せることが大事（リングはやめ、単純な並びにした）
// - 置き方: 基本はポインタの上に横並び。上端で入らなければ下。右端で入らなければ縦並びにしてポインタの左、左端なら縦並びで右
// - 押している間はポインタの周りに輪が満ちていく。MOVE_SLOP より動いたら取り消す（出す位置は最後のポインタの位置）
// - 出ている間は画面全体に薄い幕を掛けて、ほかの操作を止める。右ボタンを離しても残り、アイコンを押すとそのモードにして閉じる。
//   アイコンの外を押す（右ボタンも）・Esc・アイコンから LEAVE_DIST より離れる（ポインタから見てアイコンの向こう側へ通り過ぎたら PASS_DIST）では何もせずに閉じる
// - 並びの外側の真ん中にミニマップのボタン。押すとアイコンを消し、その場所にミニマップ（下に倍率の帯。minimap.ts の minimapView）を出す。
//   図が画面に収まっていても出す。閉じ方はアイコンと同じ（ミニマップの四角をドラッグしている間は離れても閉じない）
// - アイコンに乗ると、名前（選択ツールなど）を横並びなら上、縦並びならポインタと反対の側に出す
// 押し続けの判定と、短く押したときのコンテキストメニューとの兼ね合いは context-menu.ts
import type { Graph, Mode } from "./graph";
import { injectStyle } from "./dom";
import { t } from "./i18n";
import { modeIcon } from "./mode-icons";
import { minimapView, watchStage } from "./minimap";

export const LONG_PRESS_MS = 250; // 長押しの時間（後で全体設定から変えられるようにする）
export const MOVE_SLOP = 5;       // 長押しを取り消さない動きの遊び（px）
const PICK_MODES = ["move", "pan", "reparent"] as const satisfies readonly Mode[];
const ICON = 40, GAP = 6, AWAY = 16, MARGIN = 6; // アイコンの大きさ・間・ポインタからの離れ・画面の端との間（px）
const MAP_W = 200; // 右の長押しから出すミニマップの幅（px）
const ICON_MAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="7" width="6" height="5" rx="1"/></svg>'; // i18n-ok（タブ行の全体像のボタンと同じ絵）
const LEAVE_DIST = 80; // アイコンの並びからこれより離れたら、押さずに閉じる（px）
const PASS_DIST = 40;  // ポインタから見てアイコンの向こう側へ、これより通り過ぎたら閉じる（px）
const RING_R = 14;   // 押している間の輪の半径
const RING_SHOW = 120; // 輪を出し始めるまで（ふつうの右クリックで輪がちらつかないように）

const STYLE_ID = "matomezu-mode-picker-style";
const CSS = `/* i18n-ok（CSS のコメント） */
.mz-mpick-ring { position: fixed; z-index: 960; pointer-events: none; overflow: visible; }
.mz-mpick-ring circle { fill: none; stroke: var(--accent, #8b6cf0); stroke-width: 3; stroke-linecap: round; opacity: 0.85; }
.mz-mpick-overlay { position: fixed; inset: 0; z-index: 960; background: rgba(0, 0, 0, 0.12); }
.mz-mpick-btn {
  all: unset; position: fixed; box-sizing: border-box; display: grid; place-items: center; cursor: pointer; border-radius: 50%;
  color: #f4f4f5; background: #2e2e34; border: 1px solid rgba(255, 255, 255, 0.16); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
.mz-mpick-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.mz-mpick-btn:hover, .mz-mpick-btn:focus-visible { background: #45405a; }
.mz-mpick-tip {
  position: fixed; pointer-events: none; white-space: nowrap; padding: 3px 8px; border-radius: 5px; font-size: 12px; line-height: 1.4;
  color: #f4f4f5; background: #2e2e34; border: 1px solid rgba(255, 255, 255, 0.16); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.mz-mpick-btn[aria-pressed="true"] { background: var(--accent, #8b6cf0); color: #fff; border-color: transparent; }
.mz-minimap.mz-mpick-panel { position: fixed; opacity: 1; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-mpick-btn { color: #1b1b1f; background: #fff; border-color: rgba(0, 0, 0, 0.12); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18); }
  :root:not([data-theme="dark"]) .mz-mpick-btn:hover { background: #ece8fb; }
  :root:not([data-theme="dark"]) .mz-mpick-tip { color: #1b1b1f; background: #fff; border-color: rgba(0, 0, 0, 0.12); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14); }
  :root:not([data-theme="dark"]) .mz-mpick-btn[aria-pressed="true"] { background: var(--accent, #6d4bd8); color: #fff; }
}
`;

const LABELS: Record<(typeof PICK_MODES)[number], string> = { move: t("選択ツール"), pan: t("ハンドツール"), reparent: t("付け替えツール") };

// 押している間の輪。at を動かせる。閉じる関数を返す
export function pressRing(at: { x: number; y: number }): { move(at: { x: number; y: number }): void; close(): void } {
  injectStyle(STYLE_ID, CSS);
  const ns = "http://www.w3.org/2000/svg", size = RING_R * 2 + 6;
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("mz-mpick-ring");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  const c = document.createElementNS(ns, "circle");
  c.setAttribute("cx", String(size / 2));
  c.setAttribute("cy", String(size / 2));
  c.setAttribute("r", String(RING_R));
  c.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`); // 真上から満ちる
  const len = 2 * Math.PI * RING_R;
  c.style.strokeDasharray = `${len}`;
  c.style.strokeDashoffset = `${len}`;
  svg.appendChild(c);
  const place = (p: { x: number; y: number }) => { svg.style.left = `${p.x - size / 2}px`; svg.style.top = `${p.y - size / 2}px`; };
  place(at);
  const timer = setTimeout(() => {
    document.body.appendChild(svg);
    c.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: LONG_PRESS_MS - RING_SHOW, fill: "forwards" });
  }, RING_SHOW);
  return { move: place, close: () => { clearTimeout(timer); svg.remove(); } };
}

// アイコンを置く位置（左上の座標）と並べ方、ミニマップのボタンの位置（map）。基本は上に横並び、上端で入らなければ下。
// 左右の端で横に入らなければ縦並びにして、右端ならポインタの左（left）、左端なら右（right）。
// ミニマップのボタンは並びの外側（ポインタと反対の側）の真ん中。上に並べるのは、ミニマップのボタンまで入るときだけ
type Slot = { x: number; y: number };
export function pickerSlots(at: Slot, n: number, view: { w: number; h: number }): { slots: Slot[]; lay: "row" | "left" | "right"; map: Slot } {
  const span = n * ICON + (n - 1) * GAP;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const lay = at.x + span / 2 > view.w - MARGIN ? "left" : at.x - span / 2 < MARGIN ? "right" : "row";
  const mid = (n - 1) >> 1;
  if (lay !== "row") {
    const x = lay === "left" ? at.x - AWAY - ICON : at.x + AWAY;
    const top = clamp(at.y - span / 2, MARGIN, view.h - span - MARGIN);
    const slots = Array.from({ length: n }, (_, i) => ({ x, y: top + i * (ICON + GAP) }));
    return { lay, slots, map: { x: lay === "left" ? x - GAP - ICON : x + ICON + GAP, y: slots[mid]!.y } };
  }
  const above = at.y - AWAY - 2 * ICON - GAP >= MARGIN;
  const y = above ? at.y - AWAY - ICON : at.y + AWAY;
  const left = at.x - span / 2;
  const slots = Array.from({ length: n }, (_, i) => ({ x: left + i * (ICON + GAP), y }));
  return { lay, slots, map: { x: slots[mid]!.x, y: above ? y - GAP - ICON : y + ICON + GAP } };
}

// モードのアイコンを at の近くに出す。閉じる関数を返す。closed は閉じたとき（右ボタンで閉じたら byRight）。stage は図の枠（ミニマップに映す）
export function openModePicker(graph: Graph, stage: HTMLElement, at: { x: number; y: number }, closed: (byRight: boolean) => void): () => void {
  injectStyle(STYLE_ID, CSS);
  const stop = new AbortController();
  const { signal } = stop;
  const overlay = document.createElement("div");
  overlay.className = "mz-mpick-overlay";
  overlay.setAttribute("role", "toolbar");
  overlay.setAttribute("aria-label", t("モードの切り替え"));
  let unmap = () => {}; // ミニマップを出していれば、それを片付ける
  const close = (byRight = false) => {
    if (signal.aborted) return;
    stop.abort();
    unmap();
    overlay.remove();
    closed(byRight);
  };
  const { slots, lay, map } = pickerSlots(at, PICK_MODES.length, { w: window.innerWidth, h: window.innerHeight });
  // アイコンの並び（ミニマップのボタンも）の外枠。離れたら閉じる判定に使う
  const all = [...slots, map];
  const ends = { x0: Math.min(...all.map(p => p.x)), y0: Math.min(...all.map(p => p.y)), x1: Math.max(...all.map(p => p.x)) + ICON, y1: Math.max(...all.map(p => p.y)) + ICON };
  // 乗ったアイコンの名前。横並びなら上（入らなければ下）、縦並びならポインタと反対の側
  const tip = document.createElement("div");
  tip.className = "mz-mpick-tip";
  tip.hidden = true;
  const showTip = (slot: { x: number; y: number }, label: string) => {
    tip.textContent = label;
    tip.hidden = false;
    const r = tip.getBoundingClientRect(), g = 6;
    const left = lay === "left" ? slot.x - g - r.width : lay === "right" ? slot.x + ICON + g
      : Math.max(MARGIN, Math.min(slot.x + ICON / 2 - r.width / 2, window.innerWidth - r.width - MARGIN));
    const top = lay !== "row" ? slot.y + ICON / 2 - r.height / 2 : slot.y - g - r.height >= MARGIN ? slot.y - g - r.height : slot.y + ICON + g;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  PICK_MODES.forEach((m, i) => {
    const slot = slots[i]!;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mz-mpick-btn";
    b.dataset.mode = m;
    b.setAttribute("aria-label", LABELS[m]);
    b.setAttribute("aria-pressed", String(graph.mode() === m));
    b.innerHTML = modeIcon(m); // タブ行のモードのボタンと同じ絵
    Object.assign(b.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${ICON}px`, height: `${ICON}px` });
    b.addEventListener("click", e => {
      e.stopPropagation();
      close();
      if (graph.mode() !== m) graph.setMode(m);
    }, { signal });
    // 広がる途中でアイコンがポインタの下を通っても出さない（ポインタを動かして乗ったときだけ）
    b.addEventListener("pointermove", () => { if (tip.hidden || tip.textContent !== LABELS[m]) showTip(slot, LABELS[m]); }, { signal });
    b.addEventListener("pointerleave", () => { tip.hidden = true; }, { signal });
    overlay.appendChild(b);
    // ポインタの位置から、回りながら定位置へ広がる
    const dx = at.x - (slot.x + ICON / 2), dy = at.y - (slot.y + ICON / 2);
    b.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(-180deg) scale(0.3)`, opacity: 0 },
      { transform: "none", opacity: 1 },
    ], { duration: 200, delay: i * 35, easing: "cubic-bezier(0.2, 0.8, 0.3, 1.1)", fill: "backwards" });
  });
  // ミニマップのボタン: 押すとアイコンを消し、その場所にミニマップ（倍率の帯つき）を出す
  const mapBtn = document.createElement("button");
  mapBtn.type = "button";
  mapBtn.className = "mz-mpick-btn mz-mpick-map";
  mapBtn.setAttribute("aria-label", t("全体像"));
  mapBtn.innerHTML = ICON_MAP;
  Object.assign(mapBtn.style, { left: `${map.x}px`, top: `${map.y}px`, width: `${ICON}px`, height: `${ICON}px` });
  mapBtn.addEventListener("pointermove", () => { if (tip.hidden || tip.textContent !== t("全体像")) showTip(map, t("全体像")); }, { signal });
  mapBtn.addEventListener("pointerleave", () => { tip.hidden = true; }, { signal });
  mapBtn.addEventListener("click", e => { e.stopPropagation(); showMap(); }, { signal });
  overlay.appendChild(mapBtn);
  mapBtn.animate([
    { transform: `translate(${at.x - map.x - ICON / 2}px, ${at.y - map.y - ICON / 2}px) scale(0.3)`, opacity: 0 },
    { transform: "none", opacity: 1 },
  ], { duration: 200, delay: PICK_MODES.length * 35, easing: "cubic-bezier(0.2, 0.8, 0.3, 1.1)", fill: "backwards" });
  function showMap() {
    for (const b of overlay.querySelectorAll(".mz-mpick-btn")) b.remove();
    tip.hidden = true;
    const view = minimapView(stage, graph, { width: MAP_W, maxHeight: () => window.innerHeight * 0.5 });
    const panel = view.el;
    panel.classList.add("mz-mpick-panel");
    overlay.appendChild(panel);
    // アイコンの並びがあった所に、ポインタと反対の側へ広げて置く（画面からはみ出すなら内へ寄せる）
    const box = { ...ends };
    const place = () => {
      // 大きさは広がるアニメーション（scale）の影響を受けない元の大きさで測る（途中で測ると小さく測り、押したときに正しい位置へ飛んでいた）
      const r = { width: panel.offsetWidth, height: panel.offsetHeight }, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
      const left = lay === "left" ? box.x1 - r.width : lay === "right" ? box.x0 : cx - r.width / 2;
      const top = lay !== "row" ? cy - r.height / 2 : box.y1 <= at.y ? box.y1 - r.height : box.y0;
      const l = Math.max(MARGIN, Math.min(left, window.innerWidth - r.width - MARGIN));
      const tp = Math.max(MARGIN, Math.min(top, window.innerHeight - r.height - MARGIN));
      panel.style.left = `${l}px`;
      panel.style.top = `${tp}px`;
      Object.assign(ends, { x0: l, y0: tp, x1: l + r.width, y1: tp + r.height }); // 離れたら閉じる判定は、ミニマップの外から測る
    };
    view.draw();
    place();
    panel.animate([{ transform: "scale(0.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 160, easing: "ease-out" });
    const unwatch = watchStage(stage, () => { view.draw(); place(); });
    unmap = () => { unwatch(); view.destroy(); };
  }
  // アイコンの外を押したら、何もせずに閉じる（右ボタンも閉じるだけ）
  overlay.addEventListener("pointerdown", e => { if (e.target === overlay) close(e.button === 2); }, { signal });
  overlay.addEventListener("contextmenu", e => e.preventDefault(), { signal });
  overlay.appendChild(tip);
  // アイコンの並びから離れたら、押さずに閉じる（今のモードのまま）
  window.addEventListener("pointermove", e => {
    if (e.buttons !== 0) return; // ミニマップの四角をドラッグしている間は閉じない
    const dx = Math.max(ends.x0 - e.clientX, 0, e.clientX - ends.x1), dy = Math.max(ends.y0 - e.clientY, 0, e.clientY - ends.y1);
    // 向こう側: 上に並べたら上、下なら下、縦並びで左なら左、右なら右
    const past = lay === "left" ? ends.x0 - e.clientX : lay === "right" ? e.clientX - ends.x1 : ends.y1 <= at.y ? ends.y0 - e.clientY : e.clientY - ends.y1;
    if (Math.hypot(dx, dy) > LEAVE_DIST || past > PASS_DIST) close();
  }, { signal });
  // 出ている間はほかの操作を止める: キー（Esc は閉じる）とホイール
  window.addEventListener("keydown", e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === " " && !e.repeat)) close(); // Space で出したら、もう一度 Space で閉じる
  }, { signal, capture: true });
  window.addEventListener("wheel", e => e.preventDefault(), { signal, capture: true, passive: false });
  window.addEventListener("resize", () => close(), { signal });
  window.addEventListener("blur", () => close(), { signal });
  document.body.appendChild(overlay);
  return () => close();
}
