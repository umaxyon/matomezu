// 画面の履歴（Undo・Redo）: 利用者の 1 回の操作で変わったブックの前と後を 1 段に持つ（store が作り、戻す・やり直すのは base の history）
import type { Book } from "./schema/book"

// 1 段: 変えたブックごとの前と後（1 回の操作が、いくつかのブックを変えることがある）。at は段を始めた時点
export interface HistoryStep {
  at: string
  books: Readonly<Record<string, { before: Book; after: Book }>>
}

// ブックごとの履歴: 戻せる段（古い順）と、やり直せる段（古い順。最後が次にやり直す段）
export interface BookHistory {
  undo: readonly HistoryStep[]
  redo: readonly HistoryStep[]
}
export const NO_HISTORY: BookHistory = { undo: [], redo: [] }
export const HISTORY_LIMIT = 100 // ブックごとに覚える段の数
