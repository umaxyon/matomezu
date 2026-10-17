// 右の長押しで出すモードの切り替え（D39 の試し。2026-10-17 ユーザーと決めた形）:
// - 図の中で右ボタンを LONG_PRESS_MS 押し続けると、ポインタのすぐ近くにモードのアイコン（選択・手のひら・付け替え）を並べて出す。
//   マウスのまま、今の位置からすぐ押せることが大事（リングはやめ、単純な並びにした）
// - 置き方: 基本はポインタの上に横並び。上端で入らなければ下。右端で入らなければ縦並びにしてポインタの左、左端なら縦並びで右
// - 押している間はポインタの周りに輪が満ちていく。MOVE_SLOP より動いたら取り消す（出す位置は最後のポインタの位置）
// - 出ている間は画面全体に薄い幕を掛けて、ほかの操作を止める。右ボタンを離しても残り、アイコンを押すとそのモードにして閉じる。
//   アイコンの外を押す（右ボタンも）・Esc・アイコンから LEAVE_DIST より離れる（ポインタから見てアイコンの向こう側へ通り過ぎたら PASS_DIST）では何もせずに閉じる
// - アイコンに乗ると、名前（選択ツールなど）を横並びなら上、縦並びならポインタと反対の側に出す
// 押し続けの判定と、短く押したときのコンテキストメニューとの兼ね合いは context-menu.ts
import type { Graph, Mode } from "./graph";
import { injectStyle } from "./dom";
import { t } from "./i18n";
import { modeIcon } from "./mode-icons";

export const LONG_PRESS_MS = 300; // 長押しの時間（後で全体設定から変えられるようにする）
export const MOVE_SLOP = 5;       // 長押しを取り消さない動きの遊び（px）
const PICK_MODES = ["move", "pan", "reparent"] as const satisfies readonly Mode[];
const ICON = 40, GAP = 6, AWAY = 16, MARGIN = 6; // アイコンの大きさ・間・ポインタからの離れ・画面の端との間（px）
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

// アイコンを置く位置（左上の座標）と並べ方。基本は上に横並び、上端で入らなければ下。
// 左右の端で横に入らなければ縦並びにして、右端ならポインタの左（left）、左端なら右（right）
export function pickerSlots(at: { x: number; y: number }, n: number, view: { w: number; h: number }): { slots: { x: number; y: number }[]; lay: "row" | "left" | "right" } {
  const span = n * ICON + (n - 1) * GAP;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const lay = at.x + span / 2 > view.w - MARGIN ? "left" : at.x - span / 2 < MARGIN ? "right" : "row";
  if (lay !== "row") {
    const x = lay === "left" ? at.x - AWAY - ICON : at.x + AWAY;
    const top = clamp(at.y - span / 2, MARGIN, view.h - span - MARGIN);
    return { lay, slots: Array.from({ length: n }, (_, i) => ({ x, y: top + i * (ICON + GAP) })) };
  }
  const y = at.y - AWAY - ICON >= MARGIN ? at.y - AWAY - ICON : at.y + AWAY;
  const left = at.x - span / 2;
  return { lay, slots: Array.from({ length: n }, (_, i) => ({ x: left + i * (ICON + GAP), y })) };
}

// モードのアイコンを at の近くに出す。閉じる関数を返す。closed は閉じたとき（右ボタンで閉じたら byRight）
export function openModePicker(graph: Graph, at: { x: number; y: number }, closed: (byRight: boolean) => void): () => void {
  injectStyle(STYLE_ID, CSS);
  const stop = new AbortController();
  const { signal } = stop;
  const overlay = document.createElement("div");
  overlay.className = "mz-mpick-overlay";
  overlay.setAttribute("role", "toolbar");
  overlay.setAttribute("aria-label", t("モードの切り替え"));
  const close = (byRight = false) => {
    if (signal.aborted) return;
    stop.abort();
    overlay.remove();
    closed(byRight);
  };
  const { slots, lay } = pickerSlots(at, PICK_MODES.length, { w: window.innerWidth, h: window.innerHeight });
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
  // アイコンの外を押したら、何もせずに閉じる（右ボタンも閉じるだけ）
  overlay.addEventListener("pointerdown", e => { if (e.target === overlay) close(e.button === 2); }, { signal });
  overlay.addEventListener("contextmenu", e => e.preventDefault(), { signal });
  overlay.appendChild(tip);
  // アイコンの並びから離れたら、押さずに閉じる（今のモードのまま）
  const ends = { x0: Math.min(...slots.map(p => p.x)), y0: Math.min(...slots.map(p => p.y)), x1: Math.max(...slots.map(p => p.x)) + ICON, y1: Math.max(...slots.map(p => p.y)) + ICON };
  window.addEventListener("pointermove", e => {
    const dx = Math.max(ends.x0 - e.clientX, 0, e.clientX - ends.x1), dy = Math.max(ends.y0 - e.clientY, 0, e.clientY - ends.y1);
    // 向こう側: 上に並べたら上、下なら下、縦並びで左なら左、右なら右
    const past = lay === "left" ? ends.x0 - e.clientX : lay === "right" ? e.clientX - ends.x1 : ends.y1 <= at.y ? ends.y0 - e.clientY : e.clientY - ends.y1;
    if (Math.hypot(dx, dy) > LEAVE_DIST || past > PASS_DIST) close();
  }, { signal });
  // 出ている間はほかの操作を止める: キー（Esc は閉じる）とホイール
  window.addEventListener("keydown", e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") close();
  }, { signal, capture: true });
  window.addEventListener("wheel", e => e.preventDefault(), { signal, capture: true, passive: false });
  window.addEventListener("resize", () => close(), { signal });
  window.addEventListener("blur", () => close(), { signal });
  document.body.appendChild(overlay);
  return () => close();
}
