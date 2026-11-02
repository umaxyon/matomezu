// マークダウンのビューのペイン（ステージの中を見せ方が分けた区画 1 つ）: 原文を見せるソースのペインと、描いた文書を見せるペイン。
// 並べ方は、ステージごとの画面の状態（このプラグインの置き場）に持つ。左右（row）か上下（column）に 2 つ並べるか、1 つだけ（one）見せて上辺のタブで切り替える。
// 置き場に何も無ければ、ソースを左・描いた文書を右に並べる
export const PANES = ["source", "rendered"] as const
export type Pane = (typeof PANES)[number]

export type PaneLayout = { split: "row" | "column" } | { split: null; shown: Pane }

const DEFAULT: PaneLayout = { split: "row" }

// ステージの画面の状態 state の並べ方（形に合わなければ既定）
export function paneLayoutOf(state: unknown): PaneLayout {
  const s = state as Partial<{ split: unknown; shown: unknown }> | undefined
  if (s?.split === "row" || s?.split === "column") return { split: s.split }
  if (s?.split === null && PANES.includes(s.shown as Pane)) return { split: null, shown: s.shown as Pane }
  return DEFAULT
}

// 分割をやめ、閉じたペイン closed でない方を残す（ステージを閉じるのと同じ）
export const unsplit = (closed: Pane): PaneLayout => ({
  split: null,
  shown: closed === "source" ? "rendered" : "source",
})
