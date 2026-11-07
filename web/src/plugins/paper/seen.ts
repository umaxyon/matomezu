// 紙の見せ方の、物が見えているかの答え（見せ方の seen）: 形（最上位でも子でも）は、頭（上の辺から HEAD の高さ）が表示領域に入っていれば見えている。
// つなぐものは、どちらかの端の形が見えていれば見えている。消えた物は、消える前のページの場所で答える（土台が前のページで聞く）

import { type CoreCatalog, type ItemPage, type PlacedConnector, pageItemsOf, type Rect } from "../../plugin-api"
import { allRectsOf } from "../base"

const HEAD = 24 // 形の頭の高さ（紙の上の大きさ）

const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// ページ page の物 item が、紙の上の四角 shown（表示領域）の中に見えているか
export function seenOnPaper(catalog: CoreCatalog, page: ItemPage, item: string, shown: Rect): boolean {
  const rects = allRectsOf(catalog, page)
  const headOf = (id: string) => {
    const r = rects.get(id)
    return r !== undefined && meets({ ...r, h: Math.min(r.h, HEAD) }, shown)
  }
  if (rects.has(item)) return headOf(item)
  const line = pageItemsOf(page).find((i): i is PlacedConnector => i.id === item && "from" in i)
  return !!line && (headOf(line.from) || headOf(line.to))
}
