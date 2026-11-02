// 可変ページを整えるノーマライズステップ（core/def/normalize-step.ts）: ブックが対象のアクションのあとに、どのページも増やす向きに合わせて中身をずらす
// （pages.ts の normalizedPage）。中身をずらした量のページの shift は、このステップだけが書く（前の状態に戻す履歴の戻しを除く）
import { hasPages, putPage } from "../../../core/book"
import type { NormalizeStep } from "../../../core/def/normalize-step"
import { HISTORY_RESTORE } from "../history"
import { normalizedPage } from "./pages"

export const VARIABLE_PAGES: NormalizeStep = {
  pageFields: ["shift"],
  restoring: [HISTORY_RESTORE.id],
  normalize: (before, after, catalog) => {
    if (!hasPages(after)) return after
    let next = after
    for (const page of after.pages) {
      const done = normalizedPage(catalog, before, next, page)
      if (!done) return null
      if (done !== page) next = putPage(next, done)
    }
    return next
  },
}
