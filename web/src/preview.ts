// ヘッダーのプレビュー（見るだけのモード。残課題 D5）の切り替えと、倍率の操作。
// - ボタンで入り、もう一度押すか Esc で編集に戻る。入ると、図の全体が表示領域に収まる倍率になる（大きくはしない）
// - ＋／－のボタンと Ctrl+ホイール（Mac は Cmd も）で拡大縮小し、「全体」で収まる倍率に戻る。背景のドラッグで見る範囲を動かす（graph.ts）
// - プレビュー中は、押すと選ぶだけで、図を直す操作は効かない。サイドバーと編集のツールバーは隠す（index.html の body.previewing）
// 前に出ている図が変わったら attach で付け替える（app.ts はブックを切り替えたとき）。プレビュー中なら、新しい図もプレビューにする

import type { Graph } from "./graph";

const MIN = 0.1;
const MAX = 4;
const STEP = 1.25; // ボタン 1 回の倍率の変わり方

export interface PreviewUi {
  toggle: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  fit: HTMLButtonElement;
  level: HTMLElement; // 今の倍率（%）
}

export interface Preview {
  attach(graph: Graph | null, stage: HTMLElement | null): void;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);

export function setupPreview(ui: PreviewUi): Preview {
  let on = false;
  let graph: Graph | null = null;
  let stage: HTMLElement | null = null;
  let detach = new AbortController(); // 今の図の描画領域に付けたホイールの受け取り

  const clampZoom = (z: number) => Math.min(MAX, Math.max(MIN, z));

  // 図の全体が表示領域に収まる倍率（小さい図は大きくしない）
  function fitZoom(): number {
    if (!graph || !stage) return 1;
    const c = graph.contentSize();
    if (!c.w || !c.h) return 1;
    return clampZoom(Math.min(stage.clientWidth / c.w, stage.clientHeight / c.h, 1));
  }

  function showLevel() {
    ui.level.textContent = graph?.preview() != null ? `${Math.round(graph.preview()! * 100)}%` : "";
  }

  // 倍率を変える。at（画面の座標）の下にある図の点が動かないようにスクロールを合わせる（無ければ表示領域の真ん中）
  function zoomTo(z: number, at?: { x: number; y: number }) {
    if (!graph || !stage) return;
    const old = graph.preview();
    if (old == null) return;
    z = clampZoom(z);
    const r = stage.getBoundingClientRect();
    const px = at ? at.x - r.left : stage.clientWidth / 2;
    const py = at ? at.y - r.top : stage.clientHeight / 2;
    const wx = (stage.scrollLeft + px) / old;
    const wy = (stage.scrollTop + py) / old;
    graph.setPreview(z);
    stage.scrollLeft = wx * z - px;
    stage.scrollTop = wy * z - py;
    showLevel();
  }

  function fit() {
    if (!graph || !stage) return;
    graph.setPreview(fitZoom());
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    showLevel();
  }

  function setOn(next: boolean) {
    on = next && !!graph;
    document.body.classList.toggle("previewing", on);
    ui.toggle.setAttribute("aria-pressed", String(on));
    if (on) fit(); // サイドバーを隠してから測る（表示領域が広がる）
    else graph?.setPreview(null);
    showLevel();
  }

  ui.toggle.addEventListener("click", () => setOn(!on));
  ui.zoomIn.addEventListener("click", () => graph && zoomTo((graph.preview() ?? 1) * STEP));
  ui.zoomOut.addEventListener("click", () => graph && zoomTo((graph.preview() ?? 1) / STEP));
  ui.fit.addEventListener("click", fit);
  document.addEventListener("keydown", e => {
    if (on && e.key === "Escape" && !typing(e.target)) setOn(false);
  });

  function attach(g: Graph | null, s: HTMLElement | null) {
    if (g === graph) return;
    detach.abort();
    detach = new AbortController();
    graph?.setPreview(null);
    graph = g;
    stage = s;
    ui.toggle.disabled = !g;
    if (s) {
      // Ctrl+ホイールで拡大縮小（プレビュー中だけ。ブラウザのページの拡大は止める）
      s.addEventListener("wheel", e => {
        if (!on || !(e.ctrlKey || e.metaKey) || !graph) return;
        e.preventDefault();
        zoomTo((graph.preview() ?? 1) * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY });
      }, { passive: false, signal: detach.signal });
    }
    if (on) setOn(!!g);
  }

  ui.toggle.disabled = true;
  return { attach };
}
