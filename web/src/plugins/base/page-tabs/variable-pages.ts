// 可変ページを整える整えステップ（core/def/settle-step.ts）: ブックが対象のアクションのあとに、どのページも増やす向きに合わせて中身をずらす
// （pages.ts の settledPage）。中身をずらした量のページの shift は、このステップだけが書く（前の状態に戻す履歴の戻しを除く）
import { hasPages, putPage } from "../../../core/book"
import type { SettleStep } from "../../../core/def/settle-step"
import { HISTORY_RESTORE } from "../history"
import { settledPage } from "./pages"

export const VARIABLE_PAGES: SettleStep = {
  pageFields: ["shift"],
  restoring: [HISTORY_RESTORE.id],
  settle: (before, after, catalog) => {
    if (!hasPages(after)) return after
    let next = after
    for (const page of after.pages) {
      const done = settledPage(catalog, before, next, page)
      if (!done) return null
      if (done !== page) next = putPage(next, done)
    }
    return next
  },
}
