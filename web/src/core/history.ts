// 画面の履歴（Undo・Redo）: 利用者の 1 回の操作で変わったブックの前と後を画面の履歴の段 1 つに持つ（store が作り、戻す・やり直すのは base の history）
import type { Book } from "./schema/book"

// 画面の履歴の段: 変えたブックごとの前と後（1 回の操作が、いくつかのブックを変えることがある）。at は始めた時点
export interface HistoryStep {
  at: string
  books: Readonly<Record<string, { before: Book; after: Book }>>
}

// ブックごとの履歴: 戻せる画面の履歴の段（古い順）と、やり直せる画面の履歴の段（古い順。最後が次にやり直す物）
export interface BookHistory {
  undo: readonly HistoryStep[]
  redo: readonly HistoryStep[]
}
export const NO_HISTORY: BookHistory = { undo: [], redo: [] }
export const HISTORY_LIMIT = 100 // ブックごとに覚える画面の履歴の段の数
