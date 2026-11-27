// アセット（画像のバイト列。常駐がブックのデータとは別に、中身の sha256 を id にして持つ）を指す物を数える。
// 指してよいのはページだけで、タイプの assetsOf が答える。常駐は、どのページ（ゴミ箱・読めない物のフォルダ・バックヤードの中も）からも指されないアセットを消す。
// 1 枚でも答えられないページ（タイプが機能台帳に無い・形が読めない・assetsOf が投げた）があれば、数えきれていないとして sure を false にする（常駐は消さない）

import type { CoreCatalog } from "./core-catalog"
import type { Page } from "./schema/book"

// アセットの中身を読む URL が無いとき（ホストの無い窓。画像は「画像がありません」と描く）
export const NO_ASSET_URL = ""

// 画面がホストに画像のバイト列を渡した答え: 置けたら、そのアセットの id と種類・幅・高さ（px）。置けなければ訳
// （too-large は上限 25MB を超えた、not-image は受ける種類の画像として読めない。常駐の internal/server/assets.go）
export type AssetPut =
  | { ok: true; asset: string; mime: string; width: number; height: number }
  | { ok: false; reason: "too-large" | "not-image" }

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
