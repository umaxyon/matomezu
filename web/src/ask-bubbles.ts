/*
 * AI の問いの吹き出しと印（D36。docs/ASK-plan.md）。データにも選択にも履歴にも入れない、見せるだけの層。
 * フォーカス枠（point-frame.ts）と同じく、箱の要素には付けず、ワールドの上の層に重ねる（箱の大きさ・配置・紙の決まりに触らない）。
 * - 吹き出し: 箱から伸ばし、上下左右のうち、ほかの箱と吹き出しに一番かからない側に置く。問いの付いた箱は覆わない。
 *   紙の外の余白（スクロールできる範囲）にはみ出してよい。ほかの吹き出しに重ならずに置けなければ、印に縮めて見せる（データは開いたまま）。
 * - 印: 箱の右上の角の外の小さな点滅。隠した吹き出しと、ドロワーの問い。押すと吹き出しに戻す・ドロワーを開く（呼ぶ側が決める）。
 * - 問いが 2 つ以上なら、吹き出しの左上と印に A・B… の文字を出す（項目の letter）。
 * 位置は出ている間、毎フレーム箱の要素から読み直す。押した操作は図に届けない（選択やドラッグを始めない）。
 * リストの中でスクロールして見えなくなった行の問いは、吹き出しを出さず、印をリストの端（行がある側）に寄せる（リストの外へ飛ばない）。
 *
 *   const B = createAskBubbles({ container, worldEl, canvasEl, zoom, drawnEl, obstacles });
 *   B.set(items, handlers); B.set([], handlers) で消す
 */
import { visibleRect } from "./clip-rect";
import { esc } from "./dom";
import type { Rect } from "./geom";
import { t } from "./i18n";
import { clientRectToIn, viewRectOf } from "./viewport";

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
const TAIL = 18;  // 左右に置いた吹き出しの付け根（しっぽ）の真ん中の、箱の上の端からの高さ（CSS へは --mz-ask-tail で渡す）

type Side = "right" | "left" | "bottom" | "top";
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function createAskBubbles(ctx: AskBubblesContext) {
  let items: BubbleItem[] = [];
  let handlers: BubbleHandlers | null = null;
  const layer = document.createElement("div");
  layer.className = "mz-ask-layer";
  layer.style.setProperty("--mz-ask-tail", `${TAIL - 6}px`); // しっぽ（10px の四角を 45 度回したもの）の上の端
  const els = new Map<string, { bubble: HTMLElement | null; mark: HTMLElement; side: Side | null; key: string }>();
  let raf = 0;
  let first: string | null = null; // 最後に見せた問い（先に置く）
  // 図の上に重なっているもの（開いたドロワー）の幅・高さ。その分を見えない範囲として扱う（印を寄せる・見せるときのスクロール）
  let inset = { right: 0, bottom: 0 };

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
    if (el?.closest(".mz-ask-mark")) {
      // 開いたままの吹き出しが印に縮んでいた（付け根が見えない・ほかと重なる）なら、その問いを見せる。隠していれば開く
      const it = items.find(x => x.id === id);
      if (it?.view === "bubble" && it.state === "open") return reveal(id);
      handlers.open(id);
      if (it?.view === "bubble") reveal(id);
    }
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

  function place() {
    raf = items.length ? requestAnimationFrame(place) : 0;
    if (!items.length) return;
    if (layer.parentElement !== ctx.worldEl) ctx.worldEl.appendChild(layer); // 組み立て直しで外れた
    const w = ctx.worldEl.getBoundingClientRect(), z = ctx.zoom() || 1;
    const bounds = clientRectToIn(w, z, ctx.canvasEl.getBoundingClientRect());
    const placed: Rect[] = []; // 置いた吹き出し（後の吹き出しが避ける）
    const marks: { x: number; y: number }[] = []; // 置いた印（重なる印は左へずらす。リストの端に寄った印どうしなど）
    // 最後に見せた問い（パレット・印を押した）を先に置く（ほかの吹き出しに押されて印に縮まないように）
    const order = first ? [...items].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0)) : items;
    for (const it of order) {
      const e = els.get(it.id)!;
      const boxEl = ctx.drawnEl(it.box);
      if (!boxEl) { e.mark.hidden = true; if (e.bubble) e.bubble.hidden = true; continue; }
      // 吹き出しは箱そのもの（切り取らない位置）に付けて一緒に動かす。ただし付け根の辺が見えている側だけに置く
      // （リストの中でスクロールして、付け根が隠れたら印に縮めて、リストの外に取り残さない）
      const full = clientRectToIn(w, z, boxEl.getBoundingClientRect());
      const v = visibleRect(boxEl, ctx.worldEl);
      const vis: Rect | null = v.hidden ? null : clientRectToIn(w, z, v);
      let showBubble = !!e.bubble && it.state === "open" && !!vis;
      if (e.bubble && showBubble && vis) {
        if (e.bubble.parentElement !== layer) layer.appendChild(e.bubble);
        e.bubble.hidden = false;
        const bw = e.bubble.offsetWidth, bh = e.bubble.offsetHeight;
        const EDGE = 1;
        // 左右に置くときは、付け根（しっぽ。箱の上の端から TAIL）が見えている高さにあるときだけ。吹き出しは箱と一緒に動き、ずらさない
        const tailIn = full.y + TAIL >= vis.y && full.y + TAIL <= vis.y + vis.h;
        const at: Partial<Record<Side, Rect>> = {};
        if (tailIn && full.x + full.w <= vis.x + vis.w + EDGE) at.right = { x: full.x + full.w + GAP, y: full.y, w: bw, h: bh };
        if (tailIn && full.x >= vis.x - EDGE) at.left = { x: full.x - GAP - bw, y: full.y, w: bw, h: bh };
        if (full.y + full.h <= vis.y + vis.h + EDGE) at.bottom = { x: full.x, y: full.y + full.h + GAP, w: bw, h: bh };
        if (full.y >= vis.y - EDGE) at.top = { x: full.x, y: full.y - GAP - bh, w: bw, h: bh };
        // 避ける箱も見えている分だけ（リストの中でスクロールして見えない行は避けない）
        const boxes = ctx.obstacles(it.box).map(o => visibleRect(o, ctx.worldEl)).filter(o => !o.hidden)
          .map(o => clientRectToIn(w, z, o));
        const cost = (r: Rect) => {
          const o = { x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 }; // 左上の A・B の札もはみ出さないよう、少し広げて測る
          const outside = o.w * o.h - overlap(o, bounds); // 置いてよい範囲の外は大きく嫌う
          return outside * 100 + boxes.reduce((s, o) => s + overlap(r, o), 0) + placed.reduce((s, o) => s + overlap(r, o) * 10, 0);
        };
        const sides = (["right", "left", "bottom", "top"] as Side[]).filter(x => at[x]);
        let best: Side | null = sides.length ? sides.reduce((a, x) => (cost(at[x]!) < cost(at[a]!) ? x : a)) : null;
        if (e.side && at[e.side]) best = e.side; // 一度置いた側は変えない（スクロールで飛び移らない）
        // 置いていた側の付け根が（リストのスクロールで）隠れたら、ほかの側へ飛ばさずに印に縮める（ちらつかないように）。
        // 付け根がまた見えれば同じ側に戻る。見せ直したとき（reveal）は選び直す
        if (e.side && !at[e.side]) best = null;
        const r = best ? at[best]! : null;
        if (!r || !best || placed.some(o => overlap(r, o) > 0)) {
          showBubble = false; // 付け根が見えない・ほかの吹き出しに重ならずに置けない: 印に縮めて見せる
        } else {
          e.side = best;
          placed.push(r);
          e.bubble.dataset.side = best;
          e.bubble.style.left = `${r.x}px`;
          e.bubble.style.top = `${r.y}px`;
        }
      }
      if (e.bubble && !showBubble) e.bubble.hidden = true;
      // 印は隠した吹き出し・ドロワーの問い・置けなかった吹き出し。見えている部分の右上（見えなければリストの端）
      const showMark = !showBubble;
      if (e.mark.parentElement !== layer) layer.appendChild(e.mark);
      e.mark.hidden = !showMark;
      if (showMark) {
        const m = vis ?? { ...clientRectToIn(w, z, v), h: 0 };
        let x = m.x + m.w - 4;
        let y = m.y - 12;
        // ドロワーに隠れる所なら、見えている範囲の端へ寄せる（箱の左の端・上の端より先へは寄せない）
        const c = viewRectOf(ctx.container);
        const right = (c.right - inset.right - w.left) / z - 20;
        const bottom = (c.bottom - inset.bottom - w.top) / z - 20;
        if (inset.right && x > right) x = Math.max(m.x, right);
        if (inset.bottom && y > bottom) y = Math.max(m.y - 12, bottom);
        while (marks.some(p => Math.abs(p.x - x) < 18 && Math.abs(p.y - y) < 18)) x -= 20;
        marks.push({ x, y });
        e.mark.style.left = `${x}px`;
        e.mark.style.top = `${y}px`;
      }
    }
  }

  // その問いを見せる: 箱を（リストの中のスクロールも含めて）見せてから、吹き出しか印が見えるようにスクロールし、少し光らせる
  function reveal(id: string) {
    const it = items.find(x => x.id === id);
    const boxEl = it ? ctx.drawnEl(it.box) : null;
    if (!it || !boxEl) return;
    first = id;
    const e0 = els.get(id);
    if (e0) e0.side = null; // 見せ直すときは置く側を選び直す
    boxEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    // 箱が動いたあとの位置に置き直してから（次のフレーム）、吹き出しか印を見せる
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const e = els.get(id);
      const target = e?.bubble && !e.bubble.hidden ? e.bubble : e?.mark;
      if (!target || target.hidden) return;
      // 見えている範囲（ドロワーに隠れる分を除く）に、札や点滅の輪の分（M）まで入るようにスクロールする
      const M = 14;
      const c = viewRectOf(ctx.container), r = target.getBoundingClientRect();
      const view = { left: c.left, top: c.top, right: c.right - inset.right, bottom: c.bottom - inset.bottom };
      const dx = r.left - M < view.left ? r.left - M - view.left : r.right + M > view.right ? Math.min(r.right + M - view.right, r.left - M - view.left) : 0;
      const dy = r.top - M < view.top ? r.top - M - view.top : r.bottom + M > view.bottom ? Math.min(r.bottom + M - view.bottom, r.top - M - view.top) : 0;
      if (dx || dy) ctx.container.scrollBy({ left: dx, top: dy, behavior: "smooth" });
      target.classList.remove("mz-ask-flash");
      void target.offsetWidth;
      target.classList.add("mz-ask-flash");
    }));
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

  return { set, reveal, setInset: (right: number, bottom: number) => { inset = { right, bottom }; }, destroy: () => set([], handlers ?? ({} as BubbleHandlers)) };
}
