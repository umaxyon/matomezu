// 可変ページを整えるノーマライズステップ（core/def/normalize-step.ts）: アクションのあとに、ページを増やす向きに合わせて中身をずらす
// （pages.ts の normalizedPage）。中身をずらした量のページの shift は、このステップだけが書く（画面の履歴の段の置き直し history-restore を除く）
import type { NormalizeStepDef } from "../../../core/def/normalize-step"
import { HISTORY_RESTORE } from "../history"
import { normalizedPage } from "./pages"

export const VARIABLE_PAGES: NormalizeStepDef = {
  pageFields: ["shift"],
  restoring: [HISTORY_RESTORE.id],
  normalize: (before, after, catalog) => normalizedPage(catalog, before, after),
}
