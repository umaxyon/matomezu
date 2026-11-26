// アセット（画像のバイト列。常駐がブックのデータとは別に、中身の sha256 を id にして持つ）を指す物を数える。
// 指してよいのはページだけで、タイプの assetsOf が答える。常駐は、どのページ（ゴミ箱・読めない物のフォルダ・バックヤードの中も）からも指されないアセットを消す。
// 1 枚でも答えられないページ（タイプが機能台帳に無い・形が読めない・assetsOf が投げた）があれば、数えきれていないとして sure を false にする（常駐は消さない）

import type { CoreCatalog } from "./core-catalog"
import type { Page } from "./schema/book"

export interface AssetsInUse {
  ids: readonly string[]
  sure: boolean
}

// ページの行の並び pages が指すアセットの id（重ねない）
export function assetsInUse(catalog: CoreCatalog, pages: readonly unknown[]): AssetsInUse {
  const ids = new Set<string>()
  let sure = true
  for (const page of pages) {
    const type = typeof page === "object" && page !== null && "type" in page ? page.type : undefined
    const def = typeof type === "string" ? catalog.pageTypes.get(type) : undefined
    if (!def) {
      sure = false
      continue
    }
    if (!def.assetsOf) continue
    try {
      for (const id of def.assetsOf(page as Page)) ids.add(id)
    } catch {
      sure = false
    }
  }
  return { ids: [...ids].sort(), sure }
}
