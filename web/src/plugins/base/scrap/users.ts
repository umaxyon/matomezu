// ページを使っている所のうち、スクラップの分: 消すページ targets のそれぞれを指すスクラップ（スクラップフレームの形。図面の物もスライドの並びの物も、入れ子の中も）を持つページ。
// 常駐が書庫の全部の行（ページの行 pages とフォルダの行 folders）で引く（ホストのエンジンから呼ぶ）。
// 持つページのうち、ゴミ箱・読めない物のフォルダの中の物は数えない（一緒に消えるか、開けない）。バックヤードの中の物は数える。
// 数えるページのうち、タイプが機能台帳に無い・形が読めない物があれば、sure を false にする

import type { CoreCatalog } from "../../../core/core-catalog"
import type { Folders } from "../../../core/folders"
import type { PageUsers } from "../../../core/page-users"
import { type ItemPage, slideOf, walkShapes } from "../../../core/placed"
import { inSight } from "../../../core/references"

export function scrapUsersOf(
  catalog: CoreCatalog,
  pages: readonly unknown[],
  folders: readonly unknown[],
  targets: readonly string[],
): PageUsers {
  const asked = new Set(targets)
  const table = Object.fromEntries(
    folders.flatMap(f => (isRow(f) && typeof f.id === "string" ? [[f.id, f]] : [])),
  ) as unknown as Folders
  const users: Record<string, string[]> = {}
  let sure = true
  for (const page of pages) {
    if (!isRow(page) || typeof page.id !== "string" || !inSight(table, page.id)) continue
    if (typeof page.type !== "string" || !catalog.pageTypes.has(page.type)) {
      sure = false
      continue
    }
    let pointed: string[]
    try {
      const held = page as unknown as ItemPage
      // 紙の上の形と、形だけの並び（スライド）の形を、入れ子ごと
      const shapes = [...walkShapes(held), ...walkShapes({ ...held, items: slideOf(held) })]
      pointed = shapes.flatMap(({ shape }) => {
        const def = catalog.items.get(shape.item) as { scrapFrame?: true } | undefined
        const to = def?.scrapFrame === true ? (shape.props as { page?: unknown } | undefined)?.page : undefined
        return typeof to === "string" && asked.has(to) ? [to] : []
      })
    } catch {
      sure = false
      continue
    }
    for (const to of new Set(pointed)) {
      users[to] ??= []
      users[to].push(page.id)
    }
  }
  return { users, sure }
}

const isRow = (r: unknown): r is Record<string, unknown> => typeof r === "object" && r !== null
