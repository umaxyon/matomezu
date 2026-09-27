// ヘッダーのツールバー: Undo / Redo と、ドラッグの働き（移動 / 親子の付け替え）の切り替え

import type { Graph, Mode } from "./graph";

// Undo / Redo のボタンとキーボード（Ctrl+Z、Ctrl+Shift+Z か Ctrl+Y。Mac は Cmd）。
// 登録を外す関数を返す（ページ全体のキー操作に登録するので、図を作り直すときに外せるように）
export function setupHistory(graph: Graph, undoBtn: HTMLButtonElement, redoBtn: HTMLButtonElement): () => void {
  const listening = new AbortController();
  const { signal } = listening;
  undoBtn.addEventListener("click", () => graph.undo(), { signal });
  redoBtn.addEventListener("click", () => graph.redo(), { signal });
  document.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || graph.dragging()) return;
    // 入力欄では、文字入力の取り消しに使う
    const t = e.target;
    if (t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) graph.undo();
    else if (key === "y" || (key === "z" && e.shiftKey)) graph.redo();
    else return;
    e.preventDefault();
  }, { signal });
  return () => listening.abort();
}

const MODE_LABELS: Record<Mode, string> = { move: "移動モード", reparent: "付け替えモード" };

// ドラッグの働きの切り替え（移動 / 親子の付け替え）と、今のモードの表示
export function setupModes(graph: Graph, buttons: HTMLButtonElement[], label: HTMLElement) {
  const set = (m: Mode) => {
    graph.setMode(m);
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
    label.textContent = MODE_LABELS[m];
  };
  for (const b of buttons) b.addEventListener("click", () => set(b.dataset.mode as Mode));
}
