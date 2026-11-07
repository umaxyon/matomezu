// 紙のビューが土台に知らせる、物が見えているかの答え（useSeen）: 最上位の形は、頭（上の辺から HEAD の高さ）が表示領域 view に入っていれば見えている。
// つなぐものは、どちらかの端の形が見えていれば見えている。消えた物は、消える前のブックの場所で答える（土台が前のブックで聞く）
import { type RefObject, useCallback } from "react"
import {
  type CoreCatalog,
  hasPages,
  type ItemPage,
  type PlacedConnector,
  pageItemsOf,
  type Rect,
} from "../../../plugin-api"
import { useCoreCatalog, useToPaper } from "../../../plugin-api/ui"
import { rectsOf } from "../../base"
import { type SeenTest, useSeen } from "../../base/ui"

const HEAD = 24 // 形の頭の高さ（紙の上の大きさ）

const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// ページ page の最上位のアイテム item が、紙の上の四角 shown（表示領域）の中に見えているか
export function seenOnPaper(catalog: CoreCatalog, page: ItemPage, item: string, shown: Rect): boolean {
  const rects = rectsOf(catalog, page)
  const headOf = (id: string) => {
    const r = rects.get(id)
    return r !== undefined && meets({ ...r, h: Math.min(r.h, HEAD) }, shown)
  }
  if (rects.has(item)) return headOf(item)
  const line = pageItemsOf(page).find((i): i is PlacedConnector => i.id === item && "from" in i)
  return !!line && (headOf(line.from) || headOf(line.to))
}

export function usePaperSeen(stage: string, view: RefObject<HTMLElement | null>): void {
  const catalog = useCoreCatalog()
  const toPaperAt = useToPaper(stage)
  const test: SeenTest = useCallback(
    (page, item, book) => {
      const el = view.current
      const p = hasPages(book) ? (book.pages.find(x => x.id === page) as ItemPage | undefined) : undefined
      const a = el && toPaperAt({ x: 0, y: 0 })
      const b = el && toPaperAt({ x: el.clientWidth, y: el.clientHeight })
      return !!p && !!a && !!b && seenOnPaper(catalog, p, item, { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
    },
    [view, toPaperAt, catalog],
  )
  useSeen(stage, test)
}
