// ページを使っている所のうち、スクラップの分（core/page-users.ts）: 消すページ targets のそれぞれを指すスクラップ（スクラップフレームの形）を持つ見える所のページ。
// 常駐が書庫の全部の行 pages・folders で引く（ホストのエンジンから呼ぶ）

import type { CoreCatalog } from "../../../core/core-catalog"
import { pagesDrawnOn } from "../../../core/kept"
import { type PageUsers, pageUsersIn } from "../../../core/page-users"

export const scrapUsersOf = (
  catalog: CoreCatalog,
  pages: readonly unknown[],
  folders: readonly unknown[],
  targets: readonly string[],
): PageUsers =>
  pageUsersIn(catalog, pages, folders, targets, page =>
    // スクラップが指すページは、スクラップフレームの形の、描くのに中身を使うページ
    pagesDrawnOn(catalog, page, def => (def as { scrapFrame?: true }).scrapFrame === true),
  )
