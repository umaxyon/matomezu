// タブ行の左の道具（D26 でヘッダーをやめた）: Undo / Redo（と選んだ線の Delete キー）と、ツールのモード（選択 / 親子の付け替え / 追加 / 削除）の切り替え

import type { Graph, Mode } from "./graph";
import { openEdgeEditDialog, openEditDialog } from "./edit-dialog";
import { t } from "./i18n";

// 入力欄の中か（キー操作を文字入力に譲る）
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);
// 文字を打つ欄の中か（Delete・Backspace を文字の削除に譲る）。サイドバーの選択肢（ラジオボタン）やチェックボックス、セレクトボックスは
// 文字を消さないので、そこに焦点が残っていても選んだ線を消す（2026-10-12 ユーザー: 選択肢を押したあと Delete で消えなかった）
const textEntry = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("textarea, input:not([type=radio], [type=checkbox], [type=button], [type=range], [type=color])") || t.isContentEditable);

// Undo / Redo のボタンとキーボード（Ctrl+Z、Ctrl+Shift+Z か Ctrl+Y。Mac は Cmd）と、選んだ線か箱を消す Delete キー（Mac の delete は Backspace）、
// 選んだ箱か線の編集ダイアログを開く Enter キー（ダブルクリックと同じ）、選んだ箱を写して貼る Ctrl+C / Ctrl+V（D23）。
// 登録を外す関数を返す（ページ全体のキー操作に登録するので、図を作り直すときに外せるように）
export function setupHistory(graph: Graph, undoBtn: HTMLButtonElement, redoBtn: HTMLButtonElement): () => void {
  const listening = new AbortController();
  const { signal } = listening;
  undoBtn.addEventListener("click", () => graph.undo(), { signal });
  redoBtn.addEventListener("click", () => graph.redo(), { signal });
  document.addEventListener("keydown", e => {
    if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 選んだ線か箱を消す。箱は削除モードで押したときと同じく子孫ごと消し、消したものの一覧から戻せる（2026-10-12 ユーザー）
      const edge = graph.selectedEdge(), box = graph.selected();
      if ((!edge && box == null) || textEntry(e.target) || graph.dragging() || graph.preview() != null || graph.mode() !== "move") return;
      e.preventDefault();
      if (edge) graph.removeEdge(edge); else graph.remove(box!);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing) {
      // ボタンの上の Enter はボタンを押す。ダイアログが開いていればダイアログの Enter
      if (typing(e.target) || (e.target instanceof Element && e.target.closest("button, a, .mz-dlg-overlay"))) return;
      if (document.querySelector(".mz-dlg-overlay") || graph.mode() !== "move" || graph.preview() != null || graph.dragging()) return;
      const edge = graph.selectedEdge(), box = graph.selected();
      if (!edge && !box) return;
      e.preventDefault();
      if (edge) openEdgeEditDialog(graph, edge); else openEditDialog(graph, box!);
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || graph.dragging()) return;
    if (typing(e.target)) return; // 入力欄では、文字入力の取り消しに使う
    const key = e.key.toLowerCase();
    if (key === "c" || key === "v") {
      // コピー・貼り付け（D23）。選択と付け替えのどちらのモードでも受ける。
      // 文字を選んでいれば、ブラウザの文字のコピーに任せる
      if (e.shiftKey || graph.preview() != null || document.querySelector(".mz-dlg-overlay")) return;
      if (graph.mode() !== "move" && graph.mode() !== "reparent") return;
      if (key === "c" && !(window.getSelection()?.isCollapsed ?? true)) return;
      if (!(key === "c" ? graph.copySelected() : graph.pasteClip())) return;
      e.preventDefault();
      return;
    }
    if (key === "z" && !e.shiftKey) graph.undo();
    else if (key === "y" || (key === "z" && e.shiftKey)) graph.redo();
    else return;
    e.preventDefault();
  }, { signal });
  return () => listening.abort();
}

const MODE_LABELS: Record<Mode, string> = { move: t("選択モード"), reparent: t("付け替えモード"), remove: t("削除モード"), add: t("追加モード"), pan: t("手のひらモード") };

// ツールのモードの切り替え（移動 / 親子の付け替え / 追加 / 削除）と、今のモードの表示。
// ボタンを押すと、そのモードになる。Ctrl（Mac は Cmd）を押している間の入れ替えはやめた（Ctrl+C / Ctrl+V とぶつかる。E19。切り替え方は D39 で見直す）。
// ドラッグ中は切り替えず、手を離してから切り替える（ドラッグの途中で Space を離しても取り消さないため）。
// ボタンとラベルには、今効いているモードを出す。図の側でモードが変わったとき（一覧から戻したときなど）は、
// それをボタンで選んだのと同じに扱う。登録を外す関数を返す
// Space を押している間は、どのモードでも手のひらになり、離すと戻る（Miro と同じ。D32）
export function setupModes(graph: Graph, buttons: HTMLButtonElement[], label: HTMLElement): () => void {
  let base: Mode = graph.mode(); // ボタンで選んだモード
  let space = false;             // Space で手のひらにしているか
  const effective = (): Mode => (space ? "pan" : base);
  const show = () => {
    const m = effective();
    if (graph.dragging()) return; // 手を離してから
    if (graph.mode() !== m) graph.setMode(m);
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
    label.textContent = MODE_LABELS[m];
    label.dataset.mode = m; // 選択モードのときは札を隠す（index.html の .mode-label）
  };
  const listening = new AbortController();
  const { signal } = listening;
  for (const b of buttons) {
    b.addEventListener("click", () => {
      base = b.dataset.mode as Mode;
      show();
    }, { signal });
  }
  // Space: 入力欄・ボタンの上（Space で押す）・ダイアログの中では手のひらにしない。押している間の Space で図がスクロールしないよう止める
  const spaceTarget = (e: KeyboardEvent) =>
    e.key === " " && !typing(e.target) && !(e.target instanceof Element && e.target.closest("button, a, select, .mz-dlg-overlay"))
    && !document.querySelector(".mz-dlg-overlay") && graph.preview() == null;
  document.addEventListener("keydown", e => {
    if (!spaceTarget(e)) return;
    e.preventDefault();
    if (e.repeat || space) return;
    space = true;
    show();
  }, { signal });
  document.addEventListener("keyup", e => {
    if (e.key !== " " || !space) return;
    e.preventDefault();
    space = false;
    show();
  }, { signal });
  // Space を押したままほかのウィンドウへ移ると、離したことが届かないので解く
  window.addEventListener("blur", () => { space = false; show(); }, { signal });
  // 図の側で変わったモード（ここで切り替えた分は、今効いているモードと同じなので何もしない）
  const unsubscribe = graph.onModeChange(m => {
    if (m === effective()) return;
    base = m;
    space = false;
    show();
  });
  signal.addEventListener("abort", unsubscribe);
  // ドラッグ中に押したり離したりした分は、手を離したあとで反映する（図の側の処理が済んでから届く）
  document.addEventListener("pointerup", show, { signal });
  document.addEventListener("pointercancel", show, { signal });
  show();
  return () => listening.abort();
}
