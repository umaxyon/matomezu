// 画面の見え方（D32）: 編集中の倍率・プレビューの倍率、開いたときの位置（home）、見る範囲を動かす（手のひら・プレビューの背景のドラッグ）。
// スクロールの位置とワールドの座標の行き来は viewport.ts、ワールドをずらす量とスクロールの広さは layout.ts の sizeCanvas
import type { Mode } from "./interaction";
import { type View, homeScroll } from "./viewport";

export interface ViewContext {
  container: HTMLElement;
  worldEl: HTMLElement;
  world: { w: number; h: number };
  margin: number;
  offset(): { x: number; y: number }; // ワールドをずらしている量（layout.ts）
  syncWorld(): void;                  // 倍率に合わせてスクロールできる広さを決め直す
  mode(): Mode;
  zoomed(): void;                     // 倍率をかけた（拡大縮小で見えた LLM の変更を確かめる。D31）
  previewChanged(): void;             // プレビューに入った・抜けた
  pick(target: Element | null): boolean; // プレビュー中に押した所の箱か線を選ぶ（選んだら true。背景なら false で、見る範囲を動かす）
}

export type GraphView = ReturnType<typeof createView>;

export function createView(ctx: ViewContext) {
  const { container, worldEl, world } = ctx;
  // プレビューの倍率（null は編集中）と、今ワールドにかけている倍率、編集中の倍率
  let preview: number | null = null;
  let applied = 1;
  let editZoom = 1;

  // 倍率は transform: scale でかける（文字の並び方を変えないので、組み直すときに外さなくてよい。D32）。
  // スクロールできる広さは、見えない入れ物（canvasEl）を syncWorld が倍率に合わせて決める
  function applyZoom(z: number) {
    applied = z;
    worldEl.style.transform = z === 1 ? "" : `scale(${z})`;
    ctx.syncWorld();
    ctx.zoomed();
  }

  function setPreview(z: number | null) {
    preview = z;
    container.classList.toggle("mz-preview", z != null);
    applyZoom(z ?? editZoom);
    ctx.previewChanged();
  }

  function setZoom(z: number) {
    editZoom = z;
    if (preview == null) applyZoom(z);
  }

  const view = (): View => ({ zoom: applied, margin: ctx.margin, ox: ctx.offset().x, oy: ctx.offset().y });

  // ワールドの左上を表示領域の左上に合わせる（スクロールの位置 = 余白。D32）。隠れている図（裏のブック）はスクロールできないので、
  // 見えるようになったときに合わせる（下の ResizeObserver）
  let homed = false;
  let homeAt: { left: number; top: number } | null = null; // 合わせたスクロールの位置（そのまま動いていなければ、紙の大きさが変わったとき合わせ直す）
  function home() {
    homed = container.clientWidth > 0;
    if (!homed) return;
    // 紙が表示領域より大きければワールドの左上を表示領域の左上に、小さければ真ん中に（ずらす量が真ん中の分を含むので、その分戻す）
    homeScroll(container, view(), world.w, world.h);
    homeAt = { left: container.scrollLeft, top: container.scrollTop };
  }
  // 開いた直後に紙の型が決まる（既定の紙で合わせたあと、データの紙に替わる）ときのため、合わせたまま動いていなければ合わせ直す
  function rehome() {
    if (!homeAt) return;
    if (container.scrollLeft !== homeAt.left || container.scrollTop !== homeAt.top) { homeAt = null; return; }
    home();
  }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (!homed) home(); }).observe(container);

  // 見る範囲を動かす（つかんだ所がポインタに付いてくる）。プレビューの背景のドラッグと、手のひら（D32）
  function pan(e: PointerEvent) {
    const start = { x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop };
    const stop = new AbortController();
    container.classList.add("mz-panning");
    document.addEventListener("pointermove", ev => {
      container.scrollLeft = start.left - (ev.clientX - start.x);
      container.scrollTop = start.top - (ev.clientY - start.y);
    }, { signal: stop.signal });
    const end = () => { stop.abort(); container.classList.remove("mz-panning"); };
    document.addEventListener("pointerup", end, { signal: stop.signal });
    document.addEventListener("pointercancel", end, { signal: stop.signal });
  }

  // 手のひらのモードの押下（D32）。図の操作（interaction.ts）より先に受け取り、どこを押しても見る範囲を動かすだけにする
  // （箱を選んだり動かしたりしない）。道具箱は押せる
  container.addEventListener("pointerdown", e => {
    if (ctx.mode() !== "pan" || preview != null) return;
    if (e.target instanceof Element && e.target.closest(".mz-toolbox")) return;
    e.stopImmediatePropagation();
    e.preventDefault(); // 文字を選ばない
    if (e.button === 0) pan(e);
  }, true);

  // プレビュー中の押下。図の操作（interaction.ts）より先に受け取り、選ぶだけにする。
  // 背景を押したらワールドを選び、そのままドラッグすると見る範囲を動かす
  container.addEventListener("pointerdown", e => {
    if (preview == null) return;
    e.stopImmediatePropagation();
    if (ctx.pick(e.target instanceof Element ? e.target : null)) return;
    if (e.button === 0) pan(e);
  }, true);

  return {
    applied: () => applied,   // 今ワールドにかけている倍率
    preview: () => preview,   // プレビューの倍率（null は編集中）
    editZoom: () => editZoom, // 編集中の倍率
    setPreview, setZoom, view, home, rehome,
  };
}
