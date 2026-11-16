// 状態の中の、アクションが変えるもの全部（ページの表とフォルダの表は、ゴミ箱のブックの分も）。行うときと、行えるかを問うときで同じ物を使う
import type { World } from "../core/perform"
import type { MatomezuState } from "./store"

export const worldOf = (
  s: Pick<MatomezuState, "pages" | "folders" | "settings" | "annotations" | "records" | "counters">,
): World => ({
  pages: s.pages,
  folders: s.folders,
  settings: s.settings,
  annotations: s.annotations,
  records: s.records,
  counters: s.counters,
})
