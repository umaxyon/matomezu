/*
 * 説明ツアー（D38。docs/TOUR-plan.md）の見た目と、ツアー中の操作の止め方。判断（どの段を出すか・始め方・終え方）は app-tour.ts。
 * 画面全体に幕をかけ、段の箱だけを明るく抜いて枠で囲み、横に説明の吹き出し（［前へ］n / m［次へ］・最後は［終わる］・×）を出す。
 * ツアー中は、スクロール・拡大縮小を含めてすべての操作を止める（2026-10-16 ユーザー: コーチマークは視線を一点に集めるもの）。
 * 使えるのは吹き出しのボタンと、キーの ← →（前へ・次へ）と Esc（×と同じ）だけ。ダイアログが開いている間は、ダイアログに任せる。
 * 枠と吹き出しは画面の座標で描く（図の倍率で縮まない）。位置は出ている間、毎フレーム箱の要素から読み直す。
 *
 *   const V = createTourView({ prev, next, close });
 *   V.show({ find, color, say, index, count }); V.hold(); V.destroy();
 */
import { esc, injectStyle } from "./dom";
import { t } from "./i18n";

export interface TourViewHandlers {
  prev(): void;
  next(): void;  // 最後の段では「終わる」
  close(): void; // × と Esc
  lost(): void;  // 段の箱が無くなった
}

// find は箱の要素を探し直す（組み立て直しで要素が替わっても追う。無くなれば null）
export interface TourStepView { find(): HTMLElement | null; color: string; say: string; index: number; count: number }

const PAD = 6;     // 箱の外周から枠までの隙間（px。画面）
const GAP = 12;    // 枠から吹き出しまでの間
const MARGIN = 8;  // 吹き出しを画面の端から離す

const STYLE_ID = "matomezu-tour-style";
const CSS = `
.mz-tour { position: fixed; inset: 0; z-index: 900; cursor: default; touch-action: none; }
.mz-tour-hole { position: fixed; border-radius: 8px; border: 3px solid var(--mz-tour); box-shadow: 0 0 0 200vmax rgba(0, 0, 0, 0.68); pointer-events: none; }
.mz-tour-bubble { position: fixed; width: max-content; max-width: 280px; box-sizing: border-box; padding: 10px 12px 8px; border-radius: 10px;
  background: var(--bar, #fff); color: var(--text, inherit); border: 2px solid var(--mz-tour); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3); font-size: 14px; }
.mz-tour-say { margin: 0 22px 8px 0; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.mz-tour-nav { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.mz-tour-nav button { font: inherit; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--mz-tour); background: transparent; color: inherit; cursor: pointer; }
.mz-tour-nav button:disabled { opacity: .35; cursor: default; }
.mz-tour-nav [data-next] { background: var(--mz-tour); color: #fff; margin-left: auto; }
.mz-tour-count { opacity: .7; font-variant-numeric: tabular-nums; }
.mz-tour-close { position: absolute; top: 4px; right: 6px; border: 0; background: transparent; color: inherit; opacity: .6; font-size: 16px; cursor: pointer; }
`;

export function createTourView(h: TourViewHandlers) {
  injectStyle(STYLE_ID, CSS);
  const root = document.createElement("div");
  root.className = "mz-tour";
  root.innerHTML = `<div class="mz-tour-hole"></div><div class="mz-tour-bubble" role="dialog" aria-label="${esc(t("説明ツアー"))}"></div>`;
  const hole = root.querySelector<HTMLElement>(".mz-tour-hole")!;
  const bubble = root.querySelector<HTMLElement>(".mz-tour-bubble")!;
  document.body.appendChild(root);
  document.body.classList.add("touring");
  let step: TourStepView | null = null;
  let raf = 0;
  const stop = new AbortController();
  const { signal } = stop;

  // 幕の上の操作は図へ届けない（スクロール・拡大縮小も）。吹き出しのボタンだけが効く
  for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"] as const) {
    root.addEventListener(type, e => { if (!(e.target instanceof Element && e.target.closest(".mz-tour-bubble button"))) { e.preventDefault(); e.stopPropagation(); } }, { signal });
  }
  root.addEventListener("wheel", e => e.preventDefault(), { passive: false, signal });
  bubble.addEventListener("click", e => {
    const b = e.target instanceof Element ? e.target.closest("button") : null;
    if (!b || (b as HTMLButtonElement).disabled) return;
    if (b.hasAttribute("data-prev")) h.prev();
    else if (b.hasAttribute("data-next")) h.next();
    else if (b.hasAttribute("data-close")) h.close();
  }, { signal });
  // キー: ダイアログ（終えるかの確かめなど）が開いていればそちらに任せる。それ以外は ← → と Esc だけを受け、ほかは止める
  // （吹き出しのボタンの上の Enter・Space・Tab は、ボタンを押す・移るのに使う）
  window.addEventListener("keydown", e => {
    if (document.querySelector(".mz-dlg-overlay")) return;
    const onButton = e.target instanceof Element && !!e.target.closest(".mz-tour-bubble");
    if (onButton && (e.key === "Enter" || e.key === " " || e.key === "Tab")) {
      if (e.key === "Tab") { e.preventDefault(); cycle(e.shiftKey ? -1 : 1); }
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === "Escape") h.close();
    else if (e.key === "ArrowRight") h.next();
    else if (e.key === "ArrowLeft" && step && step.index > 0) h.prev();
  }, { capture: true, signal });
  window.addEventListener("keyup", e => { if (!document.querySelector(".mz-dlg-overlay")) e.stopPropagation(); }, { capture: true, signal });

  function cycle(dir: number) {
    const items = [...bubble.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + dir + items.length) % items.length]?.focus();
  }

  // 段を移る間（ブック・ページを切り替える・箱へスクロールする）は、前の段の箱を追わない（隠れた箱を「無くなった」と取り違えない）
  function hold() {
    step = null;
    hole.hidden = bubble.hidden = true;
  }

  function show(s: TourStepView) {
    step = s;
    hole.hidden = bubble.hidden = false;
    root.style.setProperty("--mz-tour", s.color);
    const last = s.index === s.count - 1;
    bubble.innerHTML = `<button type="button" class="mz-tour-close" data-close aria-label="${esc(t("ツアーを終える"))}" title="${esc(t("ツアーを終える"))}">×</button>
      <p class="mz-tour-say">${esc(s.say)}</p>
      <div class="mz-tour-nav"><button type="button" data-prev${s.index === 0 ? " disabled" : ""}>${esc(t("← 前へ"))}</button>
        <span class="mz-tour-count">${s.index + 1} / ${s.count}</span>
        <button type="button" data-next>${esc(last ? t("終わる") : t("次へ →"))}</button></div>`;
    bubble.querySelector<HTMLElement>("[data-next]")!.focus();
    if (!raf) place();
  }

  // 枠は箱の周り、吹き出しは右・左・下・上の順に、画面に収まる側へ置く
  function place() {
    raf = requestAnimationFrame(place);
    if (!step) return;
    const el = step.find();
    if (!el) return h.lost();
    const r = el.getBoundingClientRect();
    const box = { left: r.left - PAD, top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD };
    Object.assign(hole.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight, W = innerWidth, H = innerHeight;
    const clampX = (x: number) => Math.min(Math.max(MARGIN, x), W - bw - MARGIN);
    const clampY = (y: number) => Math.min(Math.max(MARGIN, y), H - bh - MARGIN);
    const midY = (box.top + box.bottom) / 2 - bh / 2, midX = (box.left + box.right) / 2 - bw / 2;
    let x: number, y: number;
    if (box.right + GAP + bw + MARGIN <= W) [x, y] = [box.right + GAP, clampY(midY)];
    else if (box.left - GAP - bw - MARGIN >= 0) [x, y] = [box.left - GAP - bw, clampY(midY)];
    else if (box.bottom + GAP + bh + MARGIN <= H) [x, y] = [clampX(midX), box.bottom + GAP];
    else [x, y] = [clampX(midX), clampY(box.top - GAP - bh)];
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  function destroy() {
    cancelAnimationFrame(raf);
    stop.abort();
    root.remove();
    document.body.classList.remove("touring");
  }

  return { show, hold, destroy };
}
