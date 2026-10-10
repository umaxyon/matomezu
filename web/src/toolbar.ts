// ヘッダーのツールバー: Undo / Redo と、ツールのモード（移動 / 親子の付け替え / 線）の切り替え

import type { Graph, Mode } from "./graph";

// 入力欄の中か（キー操作を文字入力に譲る）
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);

// Undo / Redo のボタンとキーボード（Ctrl+Z、Ctrl+Shift+Z か Ctrl+Y。Mac は Cmd）。
// 登録を外す関数を返す（ページ全体のキー操作に登録するので、図を作り直すときに外せるように）
export function setupHistory(graph: Graph, undoBtn: HTMLButtonElement, redoBtn: HTMLButtonElement): () => void {
  const listening = new AbortController();
  const { signal } = listening;
  undoBtn.addEventListener("click", () => graph.undo(), { signal });
  redoBtn.addEventListener("click", () => graph.redo(), { signal });
  document.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || graph.dragging()) return;
    if (typing(e.target)) return; // 入力欄では、文字入力の取り消しに使う
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) graph.undo();
    else if (key === "y" || (key === "z" && e.shiftKey)) graph.redo();
    else return;
    e.preventDefault();
  }, { signal });
  return () => listening.abort();
}

const MODE_LABELS: Record<Mode, string> = { move: "選択モード", reparent: "付け替えモード", link: "線モード", remove: "削除モード", add: "追加モード" };

// Ctrl を押している間だけ入れ替わる相手（線モードでは Ctrl を線を引くのに使うので、入れ替えない）
const FLIP: Partial<Record<Mode, Mode>> = { move: "reparent", reparent: "move" };

// ツールのモードの切り替え（移動 / 親子の付け替え / 線 / 削除）と、今のモードの表示。
// ボタンを押すと、そのモードになる（Ctrl を押しながらでも同じ。そのときは Ctrl による入れ替えを解く）。
// 移動と付け替えのときは、Ctrl（Mac は Cmd）を押している間だけ、もう一方のモードになり、離すと戻る。
// ドラッグ中は切り替えず、手を離してから切り替える（付け替えのドラッグの途中で Ctrl を離しても取り消さないため）。
// ボタンとラベルには、今効いているモードを出す。図の側でモードが変わったとき（一覧から戻したときなど）は、
// それをボタンで選んだのと同じに扱う。登録を外す関数を返す
export function setupModes(graph: Graph, buttons: HTMLButtonElement[], label: HTMLElement): () => void {
  let base: Mode = graph.mode(); // ボタンで選んだモード
  let held = false;              // Ctrl で入れ替えているか
  const effective = () => (held && FLIP[base]) || base;
  const show = () => {
    const m = effective();
    if (graph.dragging()) return; // 手を離してから
    if (graph.mode() !== m) graph.setMode(m);
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
    label.textContent = MODE_LABELS[m];
  };
  const listening = new AbortController();
  const { signal } = listening;
  for (const b of buttons) {
    b.addEventListener("click", () => {
      base = b.dataset.mode as Mode;
      held = false;
      show();
    }, { signal });
  }
  const isModifier = (e: KeyboardEvent) => e.key === "Control" || e.key === "Meta";
  document.addEventListener("keydown", e => {
    if (!isModifier(e) || e.repeat || held || typing(e.target)) return;
    held = true;
    show();
  }, { signal });
  document.addEventListener("keyup", e => {
    if (!isModifier(e) || !held) return;
    held = false;
    show();
  }, { signal });
  // Ctrl を押したままほかのウィンドウへ移ると、離したことが届かないので解く
  window.addEventListener("blur", () => { held = false; show(); }, { signal });
  // 図の側で変わったモード（ここで切り替えた分は、今効いているモードと同じなので何もしない）
  const unsubscribe = graph.onModeChange(m => {
    if (m === effective()) return;
    base = m;
    held = false;
    show();
  });
  signal.addEventListener("abort", unsubscribe);
  // ドラッグ中に押したり離したりした分は、手を離したあとで反映する（図の側の処理が済んでから届く）
  document.addEventListener("pointerup", show, { signal });
  document.addEventListener("pointercancel", show, { signal });
  show();
  return () => listening.abort();
}
