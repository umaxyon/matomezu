/*
 * AI が一時的に箱を示すフォーカス枠（D37。2026-10-16 ユーザー）。データにも、ユーザーの選択にも Undo の履歴にも入れない、見せるだけの枠。
 * 箱の要素には付けず（箱の大きさ・配置・切り抜きに触らない）、ワールドの上の別の層に、箱の外周より少し外側の四角として重ねる。
 * 位置は出ている間、毎フレーム箱の要素から読み直す（スクロール・拡大縮小・ほかの箱の変更・組み立て直しで箱が動いてもついていく）。
 * 描かれていない箱（非表示の親の中）は、描かれている一番近い祖先を囲む。
 * ユーザーの反応（図のどこかを押す・Esc）で消え、onReact で知らせる。箱が見えなくなった（ページを切り替えた・消した）ときも、反応として消す。色はテーマの focus（呼ぶ側が渡す）。
 *
 *   const F = createPointFrame({ container, worldEl, zoom, drawnEl });
 *   F.show(id, color, onReact); F.clear(); F.pointed();
 */

const GAP = 4; // 箱の外周から枠までの隙間（px。ワールドの座標）

export interface PointFrameContext {
  container: HTMLElement; // 図の枠（押されたら反応）
  worldEl: HTMLElement;   // 枠を置く層
  zoom(): number;
  drawnEl(id: string): HTMLElement | null; // 箱の要素（描かれていなければ、描かれている一番近い祖先。箱が無くなれば null）
}

export function createPointFrame(ctx: PointFrameContext) {
  let shown: { id: string; el: HTMLElement; raf: number; stop: AbortController; onReact: () => void } | null = null;

  function place() {
    if (!shown) return;
    const s = shown;
    s.raf = requestAnimationFrame(place);
    const box = ctx.drawnEl(s.id);
    if (!box) return react();
    if (s.el.parentElement !== ctx.worldEl) ctx.worldEl.appendChild(s.el); // 組み立て直しで外れた
    const r = box.getBoundingClientRect(), w = ctx.worldEl.getBoundingClientRect(), z = ctx.zoom() || 1;
    s.el.hidden = false;
    s.el.style.left = `${(r.left - w.left) / z - GAP}px`;
    s.el.style.top = `${(r.top - w.top) / z - GAP}px`;
    s.el.style.width = `${r.width / z + GAP * 2}px`;
    s.el.style.height = `${r.height / z + GAP * 2}px`;
  }

  function react() {
    const f = shown?.onReact;
    clear();
    f?.();
  }

  function clear() {
    if (!shown) return;
    cancelAnimationFrame(shown.raf);
    shown.stop.abort();
    shown.el.remove();
    shown = null;
  }

  function show(id: string, color: string, onReact: () => void) {
    clear();
    const el = document.createElement("div");
    el.className = "mz-point";
    el.style.setProperty("--mz-point", color);
    const stop = new AbortController();
    shown = { id, el, raf: 0, stop, onReact };
    // 押した操作はそのまま続ける（その箱を押せば選ぶ）
    ctx.container.addEventListener("pointerdown", react, { capture: true, signal: stop.signal });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && ctx.container.getClientRects().length) react(); }, { signal: stop.signal });
    place();
  }

  return { show, clear, pointed: () => shown?.id ?? null };
}
