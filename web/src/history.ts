// 履歴（D31。2026-10-15 ユーザー）: Undo / Redo はユーザーの操作だけを扱う。1 件は操作の差分（diff.ts）と時刻で、戻すときは今の状態に
// その逆を当てる（ブック全体の写しに戻すと、ユーザーの履歴に入っていない LLM の変更まで消えるため）。
// LLM の変更（外部の変更の読み直し）は、ユーザーの履歴に積まずに差分だけを返し（external）、ユーザーが見たら（認知）その時刻の位置に差し込む（adopt）。
// 差し込む位置は、まだ戻していない操作の中で時刻の合う所（戻した操作（Redo の残り）より後の時刻なら、今の位置）。認知は操作ではないので Redo の残りは消さない

import { type Change, applyChanges, diffData } from "./diff";
import type { Diagram } from "./types";

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

// 履歴の 1 件（操作の差分と時刻）
export interface Op {
  at: number;
  changes: Change[];
}

export interface HistoryContext {
  snapshot(): Diagram;              // 今の状態
  apply(data: Diagram): void;       // 差分を当てた状態を画面に出す
  onHistory?: (state: HistoryState) => void; // 戻れる・進めるかが変わったとき
  limit: number;                    // 残す件数
  now?: () => number;               // 時刻（テストで差し替える）
}

export function createHistory(ctx: HistoryContext) {
  const now = ctx.now ?? (() => Date.now());
  let base: Diagram = { nodes: [] }; // 最後に知っている状態（差分のもと）
  let past: Op[] = [];   // 戻せる操作（古い順）
  let future: Op[] = []; // 進められる操作（最後が次に進めるもの）

  const state = (): HistoryState => ({ canUndo: past.length > 0, canRedo: future.length > 0 });
  const notify = () => ctx.onHistory?.(state());

  // ユーザーの操作を 1 件積む（最後に知っている状態からの差分）
  function record(data = ctx.snapshot()) {
    const changes = diffData(base, data);
    base = data;
    if (!changes.length) return;
    past.push({ at: now(), changes });
    if (past.length > ctx.limit) past.shift();
    future = [];
    notify();
  }

  // 出発点にする（読み込んだとき）
  function reset() {
    base = ctx.snapshot();
    past = [];
    future = [];
    notify();
  }

  // LLM の変更（外部の変更の読み直し）。積まずに差分を返す（変わっていなければ null）
  function external(data = ctx.snapshot()): Op | null {
    const changes = diffData(base, data);
    base = data;
    return changes.length ? { at: now(), changes } : null;
  }

  // 認知した LLM の変更を、時刻の位置に差し込む
  function adopt(op: Op) {
    let i = past.length;
    while (i > 0 && past[i - 1]!.at > op.at) i--;
    past.splice(i, 0, op);
    if (past.length > ctx.limit) past.shift();
    notify();
  }

  function move(from: Op[], to: Op[], dir: "undo" | "redo"): boolean {
    const op = from.pop();
    if (!op) return false;
    ctx.apply(applyChanges(ctx.snapshot(), op.changes, dir));
    base = ctx.snapshot();
    to.push(op);
    notify();
    return true;
  }

  return {
    state, record, reset, external, adopt,
    last: () => base, // 最後に知っている状態（直前の操作のあと。紙からはみ出す操作を戻すときに使う。D33）
    undo: () => move(past, future, "undo"),
    redo: () => move(future, past, "redo"),
  };
}
