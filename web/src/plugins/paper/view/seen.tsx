// 紙のビューが土台に知らせる、物が見えているかの答え（useSeen）: 最上位の形は、頭（上の辺から HEAD の高さ）が表示領域 view に入っていれば見えている。
// つなぐものは、どちらかの端の形が見えていれば見えている。消えた物は、消える前のブックの場所で答える（土台が前のブックで聞く）
import { type RefObject, useCallback } from "react"
import { hasPages, type ItemPage, type Rect } from "../../../plugin-api"
import { useCoreCatalog, useToPaper } from "../../../plugin-api/ui"
import { rectsOf } from "../../base"
import { type SeenTest, useSeen } from "../../base/ui"

const HEAD = 24 // 形の頭の高さ（紙の上の大きさ）

const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export function usePaperSeen(stage: string, view: RefObject<HTMLElement | null>): void {
  const catalog = useCoreCatalog()
  const toPaperAt = useToPaper(stage)
  const test: SeenTest = useCallback(
    (page, item, book) => {
      const el = view.current
      const p = hasPages(book) ? (book.pages.find(x => x.id === page) as ItemPage | undefined) : undefined
      const a = el && toPaperAt({ x: 0, y: 0 })
      const b = el && toPaperAt({ x: el.clientWidth, y: el.clientHeight })
      if (!p || !a || !b) return false
      const shown = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
      const rects = rectsOf(catalog, p)
      const headOf = (id: string) => {
        const r = rects.get(id)
        return r !== undefined && meets({ ...r, h: Math.min(r.h, HEAD) }, shown)
      }
      if (rects.has(item)) return headOf(item)
      const line = (p.items ?? []).find(i => i.id === item) as { from?: string; to?: string } | undefined
      return !!line && (headOf(line.from ?? "") || headOf(line.to ?? ""))
    },
    [view, toPaperAt, catalog],
  )
  useSeen(stage, test)
}
