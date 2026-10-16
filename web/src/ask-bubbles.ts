/*
 * AI の問いの吹き出しと印（D36。docs/ASK-plan.md）。データにも選択にも履歴にも入れない、見せるだけの層。
 * フォーカス枠（point-frame.ts）と同じく、箱の要素には付けず、ワールドの上の層に重ねる（箱の大きさ・配置・紙の決まりに触らない）。
 * - 吹き出し: 箱から伸ばし、上下左右のうち、ほかの箱と吹き出しに一番かからない側に置く。問いの付いた箱は覆わない。
 *   紙の外の余白（スクロールできる範囲）にはみ出してよい。ほかの吹き出しに重ならずに置けなければ、印に縮めて見せる（データは開いたまま）。
 * - 印: 箱の右上の角の外の小さな点滅。隠した吹き出しと、ドロワーの問い。押すと吹き出しに戻す・ドロワーを開く（呼ぶ側が決める）。
 * - 問いが 2 つ以上なら、吹き出しの左上と印に A・B… の文字を出す（項目の letter）。
 * 位置は出ている間、毎フレーム箱の要素から読み直す。押した操作は図に届けない（選択やドラッグを始めない）。
 *
 *   const B = createAskBubbles({ container, worldEl, canvasEl, zoom, drawnEl, obstacles });
 *   B.set(items, handlers); B.set([], handlers) で消す
 */
import { esc } from "./dom";
import { t } from "./i18n";

export interface BubbleItem {
  id: string;
  box: string;
  text?: string;
  choices?: string[];
  letter?: string;
  view: "bubble" | "drawer";
  state: "open" | "hidden";
}

export interface BubbleHandlers {
  answer(id: string, choice: string): void; // ボタンを押した
  seen(id: string): void;                   // ボタンの無い吹き出しを × で閉じた
  hide(id: string): void;                   // 吹き出しを隠した（印に縮める）
  open(id: string): void;                   // 印を押した（隠した吹き出しを開く・ドロワーを開く）
}

export interface AskBubblesContext {
  container: HTMLElement;
  worldEl: HTMLElement;
  canvasEl: HTMLElement; // スクロールできる範囲（吹き出しを置いてよい範囲）
  zoom(): number;
  drawnEl(id: string): HTMLElement | null; // 描かれている箱の要素（描かれていなければ一番近い祖先。無ければ null）
  obstacles(id: string): HTMLElement[];   // 吹き出しが避ける箱（その箱と祖先を除く、描かれている箱）
}

const GAP = 10;   // 箱と吹き出しの間（ワールドの座標）
const STICK = 40; // 前の側を、これくらいまでの重なりの差なら保つ（ちらつかないように）

type Side = "right" | "left" | "bottom" | "top";
interface Rect { x: number; y: number; w: number; h: number }
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function createAskBubbles(ctx: AskBubblesContext) {
  let items: BubbleItem[] = [];
  let handlers: BubbleHandlers | null = null;
  const layer = document.createElement("div");
  layer.className = "mz-ask-layer";
  const els = new Map<string, { bubble: HTMLElement | null; mark: HTMLElement; side: Side | null; key: string }>();
  let raf = 0;

  // 押した操作は図に届けない（箱の選択・ドラッグ・フォーカス枠の反応を起こさない）
  layer.addEventListener("pointerdown", e => e.stopPropagation());
  layer.addEventListener("click", e => {
    e.stopPropagation();
    const el = e.target instanceof Element ? e.target : null;
    const id = el?.closest<HTMLElement>("[data-ask]")?.dataset.ask;
    if (!id || !handlers) return;
    const choice = el?.closest<HTMLElement>("[data-choice]")?.dataset.choice;
    if (choice != null) return handlers.answer(id, choice);
    if (el?.closest("[data-hide]")) return handlers.hide(id);
    if (el?.closest("[data-seen]")) return handlers.seen(id);
    if (el?.closest(".mz-ask-mark")) return handlers.open(id);
  });

  function build(it: BubbleItem) {
    const key = JSON.stringify([it.text, it.choices, it.letter, it.view]);
    const old = els.get(it.id);
    if (old && old.key === key) return old;
    old?.bubble?.remove();
    old?.mark.remove();
    let bubble: HTMLElement | null = null;
    if (it.view === "bubble") {
      bubble = document.createElement("div");
      bubble.className = "mz-ask-bubble";
      bubble.dataset.ask = it.id;
      const choices = it.choices ?? [];
      // ボタンの無い簡易メッセージは × で閉じる（見た）。ボタンがあれば「–」で隠す
      const ctl = choices.length
        ? `<button type="button" class="mz-ask-ctl" data-hide title="${esc(t("隠す"))}" aria-label="${esc(t("隠す"))}">–</button>`
        : `<button type="button" class="mz-ask-ctl" data-seen title="${esc(t("閉じる"))}" aria-label="${esc(t("閉じる"))}">×</button>`;
      bubble.innerHTML = `${it.letter ? `<span class="mz-ask-id">${esc(it.letter)}</span>` : ""}${ctl}
        ${it.text ? `<p class="mz-ask-text">${esc(it.text)}</p>` : ""}
        ${choices.length ? `<div class="mz-ask-btns">${choices.map((c, i) =>
          `<button type="button" class="mz-ask-btn${i === 0 ? " mz-ask-primary" : ""}" data-choice="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
        <span class="mz-ask-tail"></span>`;
      if (!it.text) bubble.classList.add("mz-ask-only");
    }
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "mz-ask-mark";
    mark.dataset.ask = it.id;
    mark.textContent = it.letter ?? (it.view === "drawer" ? "≡" : "");
    mark.title = it.view === "drawer" ? t("AI の問い（押すと開く）") : t("AI の問い（押すと吹き出しを開く）");
    const e = { bubble, mark, side: old?.side ?? null, key };
    els.set(it.id, e);
    return e;
  }

  // 箱の要素のワールドの座標
  function rectOf(el: Element, w: DOMRect, z: number): Rect {
    const r = el.getBoundingClientRect();
    return { x: (r.left - w.left) / z, y: (r.top - w.top) / z, w: r.width / z, h: r.height / z };
  }

  function place() {
    raf = items.length ? requestAnimationFrame(place) : 0;
    if (!items.length) return;
    if (layer.parentElement !== ctx.worldEl) ctx.worldEl.appendChild(layer); // 組み立て直しで外れた
    const w = ctx.worldEl.getBoundingClientRect(), z = ctx.zoom() || 1;
    const bounds = rectOf(ctx.canvasEl, w, z);
    const placed: Rect[] = []; // 置いた吹き出し（後の吹き出しが避ける）
    for (const it of items) {
      const e = els.get(it.id)!;
      const boxEl = ctx.drawnEl(it.box);
      if (!boxEl) { e.mark.hidden = true; if (e.bubble) e.bubble.hidden = true; continue; }
      const b = rectOf(boxEl, w, z);
      let showBubble = !!e.bubble && it.state === "open";
      if (e.bubble && showBubble) {
        if (e.bubble.parentElement !== layer) layer.appendChild(e.bubble);
        e.bubble.hidden = false;
        const bw = e.bubble.offsetWidth, bh = e.bubble.offsetHeight;
        const at: Record<Side, Rect> = {
          right: { x: b.x + b.w + GAP, y: b.y, w: bw, h: bh },
          left: { x: b.x - GAP - bw, y: b.y, w: bw, h: bh },
          bottom: { x: b.x, y: b.y + b.h + GAP, w: bw, h: bh },
          top: { x: b.x, y: b.y - GAP - bh, w: bw, h: bh },
        };
        const boxes = ctx.obstacles(it.box).map(o => rectOf(o, w, z));
        const cost = (r: Rect) => {
          const outside = r.w * r.h - overlap(r, bounds); // 置いてよい範囲の外は大きく嫌う
          return outside * 100 + boxes.reduce((s, o) => s + overlap(r, o), 0) + placed.reduce((s, o) => s + overlap(r, o) * 10, 0);
        };
        const sides: Side[] = ["right", "left", "bottom", "top"];
        let best = sides.reduce((a, s) => (cost(at[s]) < cost(at[a]) ? s : a));
        if (e.side && cost(at[e.side]) <= cost(at[best]) + STICK) best = e.side;
        const r = at[best];
        if (placed.some(o => overlap(r, o) > 0)) {
          showBubble = false; // ほかの吹き出しに重ならずに置けない: 印に縮めて見せる
        } else {
          e.side = best;
          placed.push(r);
          e.bubble.dataset.side = best;
          e.bubble.style.left = `${r.x}px`;
          e.bubble.style.top = `${r.y}px`;
        }
      }
      if (e.bubble && !showBubble) e.bubble.hidden = true;
      // 印は隠した吹き出し・ドロワーの問い・置けなかった吹き出し
      const showMark = !showBubble;
      if (e.mark.parentElement !== layer) layer.appendChild(e.mark);
      e.mark.hidden = !showMark;
      if (showMark) {
        e.mark.style.left = `${b.x + b.w - 4}px`;
        e.mark.style.top = `${b.y - 12}px`;
      }
    }
  }

  function set(next: BubbleItem[], h: BubbleHandlers) {
    items = next;
    handlers = h;
    const keep = new Set(next.map(i => i.id));
    for (const [id, e] of els) if (!keep.has(id)) { e.bubble?.remove(); e.mark.remove(); els.delete(id); }
    for (const it of next) build(it);
    if (!next.length) { layer.remove(); cancelAnimationFrame(raf); raf = 0; return; }
    if (!raf) place();
  }

  return { set, destroy: () => set([], handlers ?? ({} as BubbleHandlers)) };
}
