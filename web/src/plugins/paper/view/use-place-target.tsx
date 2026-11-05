// 置こうとしている間の置き先: ポインタの所で押すと、どこへ置くか（placing/items.ts の placeTarget）。点線の影と、入る先の形の枠が読む
import { type Point, pagedOf, type Size } from "../../../plugin-api"
import { useBook, useCoreCatalog, usePage, useStage, useToPaper } from "../../../plugin-api/ui"
import { itemSize } from "../../base"
import { type PlaceTarget, placeAt, placeTarget } from "../placing"

// 置く所: ポインタから決めた左上 at（紙の上）、置き先 target（空きが無ければ null）、置く物の大きさ size
export interface Placing {
  at: Point
  target: PlaceTarget | null
  size: Size
}

// ステージ stage で、ポインタ pointer（紙のビューの左上から）の所に置くときの置く所。置こうとしていない・ポインタが無いなら null
export function usePlaceTarget(stage: string, pointer: Point | null): Placing | null {
  const view = useStage(stage)
  const catalog = useCoreCatalog()
  const book = pagedOf(useBook(stage))
  const page = usePage(stage)
  const toPaperAt = useToPaper(stage)
  const placing = view?.placing ?? null
  const at = pointer && placeAt(toPaperAt, pointer)
  const point = pointer && toPaperAt(pointer)
  const size = placing ? itemSize(catalog, placing) : null
  if (!at || !point || !size || !book || !page) return null
  return { at, target: placeTarget(catalog, book, page, point, at, size), size }
}
