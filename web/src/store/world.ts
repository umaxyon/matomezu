// 状態の中の、アクションが変えるもの全部（ブックの一覧はゴミ箱のブックも）。行うときと、行えるかを問うときで同じ物を使う
import type { World } from "../core/perform"
import type { MatomezuState } from "./store"

export const worldOf = (s: Pick<MatomezuState, "books" | "trash" | "settings" | "annotations">): World => ({
  books: { ...s.books, ...s.trash },
  settings: s.settings,
  annotations: s.annotations,
})
