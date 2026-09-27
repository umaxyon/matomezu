// 履歴: 変更のたびに図全体の JSON を1件として残し、Undo / Redo のときはそれを読み込み直す

import type { Diagram } from "./types";

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface HistoryContext {
  snapshot(): Diagram;              // 今の状態
  apply(data: Diagram): void;       // 記録した状態を画面に戻す
  onHistory?: (state: HistoryState) => void; // 戻れる・進めるかが変わったとき
  limit: number;                    // 残す件数
}

export function createHistory(ctx: HistoryContext) {
  let past: string[] = []; // 最後が今の状態
  let future: string[] = [];

  const state = (): HistoryState => ({ canUndo: past.length > 1, canRedo: future.length > 0 });
  const notify = () => ctx.onHistory?.(state());

  function record(data = ctx.snapshot()) {
    const s = JSON.stringify(data);
    if (s === past[past.length - 1]) return;
    past.push(s);
    if (past.length > ctx.limit) past.shift();
    future = [];
    notify();
  }

  function reset() {
    past = [JSON.stringify(ctx.snapshot())];
    future = [];
    notify();
  }

  function restore(s: string) {
    ctx.apply(JSON.parse(s));
    notify();
  }

  function undo() {
    if (past.length <= 1) return false;
    future.push(past.pop()!);
    restore(past[past.length - 1]!);
    return true;
  }

  function redo() {
    const s = future.pop();
    if (s == null) return false;
    past.push(s);
    restore(s);
    return true;
  }

  return { state, record, reset, undo, redo };
}
