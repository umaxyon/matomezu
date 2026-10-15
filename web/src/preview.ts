// ヘッダーのプレビュー（見るだけのモード。残課題 D5）の切り替えと、倍率の操作。
// - ボタンで入り、もう一度押すか Esc で編集に戻る。入ると、図の全体が表示領域に収まる倍率になる（大きくはしない）
// - ＋／－のボタンと Ctrl+ホイール（Mac は Cmd も）で拡大縮小し、「全体」で収まる倍率に戻る。背景のドラッグで見る範囲を動かす（graph.ts）
// - プレビュー中は、押すと選ぶだけで、図を直す操作は効かない。サイドバー・タブ行の道具・道具箱は隠し、タブは今のブックだけにする（index.html の body.previewing）
// - 編集中も同じボタン（－・倍率・＋）と Ctrl+ホイールで、EDIT_ZOOMS の段から倍率を選ぶ（D32。2026-10-15 ユーザー）。「全体」はプレビューだけ
// - ボタンと編集中の段の切り替えは、なめらかに変える（ANIMATE_MS）。ポインタ（ボタンなら表示領域の真ん中）の下の点が動かないようにスクロールを合わせる
// 前に出ている図が変わったら attach で付け替える（app.ts はブックを切り替えたとき）。プレビュー中なら、新しい図もプレビューにする

import type { Graph } from "./graph";
import { anchorAt, keepAnchor } from "./viewport";

const MIN = 0.1;
const MAX = 4;
const STEP = 1.25; // プレビューのボタン 1 回の倍率の変わり方
const EDIT_ZOOMS = [0.75, 1, 1.25]; // 編集中の倍率の段（25% 刻み。D32。2026-10-15 ユーザー）
const ANIMATE_MS = 200; // 倍率を切り替えるアニメーションの長さ
const WHEEL_STEP = 50;  // 編集中に Ctrl+ホイールで 1 段変えるまでの回した量（ホイールの 1 目盛りくらい）

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
  // 今の倍率（プレビュー中はプレビューの倍率、編集中は編集の倍率）と、それを変える
  const current = () => (graph ? (on ? graph.preview() ?? 1 : graph.zoom()) : 1);
  const apply = (z: number) => { if (on) graph?.setPreview(z); else graph?.setZoom(z); };

  // 図の全体が表示領域に収まる倍率（小さい図は大きくしない）
  function fitZoom(): number {
    if (!graph || !stage) return 1;
    const c = graph.contentSize();
    if (!c.w || !c.h) return 1;
    return clampZoom(Math.min(stage.clientWidth / c.w, stage.clientHeight / c.h, 1));
  }

  function showLevel() {
    ui.level.textContent = graph ? `${Math.round(current() * 100)}%` : "";
    // 編集中は段の端でボタンを押せなくする
    const z = current();
    ui.zoomOut.disabled = !graph || (!on && z <= EDIT_ZOOMS[0]!);
    ui.zoomIn.disabled = !graph || (!on && z >= EDIT_ZOOMS.at(-1)!);
  }

  // 倍率を変える。at（画面の座標）の下にある図の点が動かないようにスクロールを合わせる（無ければ表示領域の真ん中）。
  // animate なら ANIMATE_MS かけてなめらかに変える（途中で次を頼まれたら、今の倍率から次へ向かい直す）
  let frame = 0;
  function zoomTo(z: number, at?: { x: number; y: number }, animate = false) {
    if (!graph || !stage) return;
    const g = graph, s = stage;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    z = clampZoom(z);
    const from = g.view().zoom; // 今かかっている倍率（アニメーションの途中ならその途中の値）
    const a = anchorAt(s, g.view(), at);
    const put = (k: number) => {
      apply(k);
      keepAnchor(s, g.view(), a);
    };
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduced || from === z) {
      put(z);
      showLevel();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATE_MS);
      const e = 1 - (1 - t) ** 3; // 終わりに向けてゆっくり
      put(t < 1 ? from + (z - from) * e : z);
      if (t < 1) frame = requestAnimationFrame(step);
      else frame = 0;
    };
    frame = requestAnimationFrame(step);
    // 倍率の表示とボタンは、行き先の倍率ですぐ変える（アニメーションの途中で押せる・押せないが揺れないように）
    ui.level.textContent = `${Math.round(z * 100)}%`;
    ui.zoomOut.disabled = !on && z <= EDIT_ZOOMS[0]!;
    ui.zoomIn.disabled = !on && z >= EDIT_ZOOMS.at(-1)!;
  }

  // 編集中の倍率の段を dir（+1 で大きく、-1 で小さく）だけ動かす。今の倍率が段の間なら、近い段から数える
  let target = 1; // アニメーションの行き先（続けて押したとき、途中の倍率ではなく行き先から数える）
  function editStep(dir: number, at?: { x: number; y: number }) {
    if (!graph) return;
    const base = frame ? target : graph.zoom();
    const i = EDIT_ZOOMS.reduce((best, v, k) => (Math.abs(v - base) < Math.abs(EDIT_ZOOMS[best]! - base) ? k : best), 0);
    const next = EDIT_ZOOMS[Math.max(0, Math.min(EDIT_ZOOMS.length - 1, i + dir))]!;
    if (next === base) return;
    target = next;
    zoomTo(next, at, true);
  }

  function fit() {
    if (!graph || !stage) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    graph.setPreview(fitZoom());
    graph.home(); // ワールドの左上を表示領域の左上に
    showLevel();
  }

  function setOn(next: boolean) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    on = next && !!graph;
    document.body.classList.toggle("previewing", on);
    ui.toggle.setAttribute("aria-pressed", String(on));
    if (on) fit(); // サイドバーを隠してから測る（表示領域が広がる）
    else graph?.setPreview(null);
    showLevel();
  }

  ui.toggle.addEventListener("click", () => setOn(!on));
  ui.zoomIn.addEventListener("click", () => { if (on) zoomTo(current() * STEP, undefined, true); else editStep(1); });
  ui.zoomOut.addEventListener("click", () => { if (on) zoomTo(current() / STEP, undefined, true); else editStep(-1); });
  ui.fit.addEventListener("click", fit);
  document.addEventListener("keydown", e => {
    if (on && e.key === "Escape" && !typing(e.target)) setOn(false);
  });

  function attach(g: Graph | null, s: HTMLElement | null) {
    if (g === graph) return;
    detach.abort();
    detach = new AbortController();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    graph?.setPreview(null);
    graph = g;
    stage = s;
    ui.toggle.disabled = !g;
    if (s) {
      // Ctrl+ホイールで拡大縮小（ブラウザのページの拡大は止める）。プレビュー中は回した分だけなめらかに、編集中は段を 1 つずつ
      let wheel = 0;
      s.addEventListener("wheel", e => {
        if (!(e.ctrlKey || e.metaKey) || !graph) return;
        e.preventDefault();
        const at = { x: e.clientX, y: e.clientY };
        if (on) return zoomTo((graph.preview() ?? 1) * Math.exp(-e.deltaY * 0.002), at);
        wheel += e.deltaY;
        if (Math.abs(wheel) < WHEEL_STEP) return;
        editStep(wheel < 0 ? 1 : -1, at);
        wheel = 0;
      }, { passive: false, signal: detach.signal });
    }
    if (on) setOn(!!g);
    showLevel();
  }

  ui.toggle.disabled = true;
  return { attach };
}
