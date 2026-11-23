// 置こうとしている間の置き先: ポインタの所で押すと、どこへ置くか（placing/items.ts の placeTarget）。点線の影と、入る先の形の枠が読む
import { NO_PAGE, NO_PAPER, NO_PLACING, NO_STAGE, type Point, type Size } from "../../../plugin-api"
import { useCoreCatalog, usePage, useStage, useToPaper } from "../../../plugin-api/ui"
import { placedSize } from "../../base"
import { type PlaceTarget, placeAt, placeTarget, placingShape } from "../placing"

// 置く所: ポインタから決めた左上 at（紙の上）、置き先 target（空きが無ければ null）、置く物の大きさ size
export interface Placing {
  at: Point
  target: PlaceTarget | null
  size: Size
}

// 描いている場所のステージで、ポインタ pointer（紙のビューの左上から）の所に置くときの置く所。置こうとしていない・ポインタが無いなら null
export function usePlaceTarget(pointer: Point | null): Placing | null {
  const view = useStage()
  const catalog = useCoreCatalog()
  const page = usePage()
  const toPaperAt = useToPaper()
  const placing = view === NO_STAGE ? NO_PLACING : view.placing
  const at = pointer ? placeAt(toPaperAt, pointer) : NO_PAPER
  const point = pointer ? toPaperAt(pointer) : NO_PAPER
  const shape = placing === NO_PLACING ? null : placingShape(catalog, placing.item, placing.props)
  const size = shape && placedSize(catalog, shape)
  if (at === NO_PAPER || point === NO_PAPER || !shape || !size || page === NO_PAGE) return null
  return { at, target: placeTarget(catalog, page, point, at, shape), size }
}
