// ページを使っている所のうち、スクラップの分（core/page-users.ts）: 消すページ targets のそれぞれを指すスクラップ（スクラップフレームの形）を持つ見える所のページ。
// 常駐が書庫の全部の行 pages・folders で引く（ホストのエンジンから呼ぶ）

import type { CoreCatalog } from "../../../core/core-catalog"
import { type PageUsers, pageUsersIn } from "../../../core/page-users"
import { type ItemPage, slideOf, walkShapes } from "../../../core/placed"

export const scrapUsersOf = (
  catalog: CoreCatalog,
  pages: readonly unknown[],
  folders: readonly unknown[],
  targets: readonly string[],
): PageUsers => pageUsersIn(catalog, pages, folders, targets, page => scrapTargetsOn(catalog, page))

// ページ page のスクラップが指すページの id（紙の上の形と、形だけの並び〈スライド〉の形を、入れ子ごと）
function scrapTargetsOn(catalog: CoreCatalog, page: ItemPage): string[] {
  const shapes = [...walkShapes(page), ...walkShapes({ ...page, items: slideOf(page) })]
  return shapes.flatMap(({ shape }) => {
    const def = catalog.items.get(shape.item) as { scrapFrame?: true } | undefined
    const to = def?.scrapFrame === true ? (shape.props as { page?: unknown } | undefined)?.page : undefined
    return typeof to === "string" ? [to] : []
  })
}
