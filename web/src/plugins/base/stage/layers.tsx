// ステージのレイヤー（スロット book-layers に置くウィジェット）: 紙の白い面を描くレイヤーと、開いたブックをそのタイプが選んだ見せ方のビューで描くレイヤー。
// 紙の面は紙の座標の枠（PaperFrame）に描き、ポインタは受けない（上のレイヤーとステージが受ける）。ページが無い・紙を出せないときは描かない（知らせはブックのビューが出す）
import { bookType } from "../../../core/core-catalog"
import { fail } from "../../../core/errors"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { useStage } from "../../../ui/view-hooks"
import { PaperFrame } from "../utils/PaperFrame"
import type { StageSlotProps } from "../workspace/ui"
import styles from "./layers.module.css"

export function PaperLayer({ stage: id }: StageSlotProps) {
  const stage = useStage(id)
  if (!stage?.opened || stage.opened.page === null) return null
  return <PaperFrame stage={stage} className={styles.paper} aria-hidden="true" data-paper-surface />
}

export function BookContentLayer({ stage: id }: StageSlotProps) {
  const type = useStage(id)?.opened?.type
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  if (!type) return null
  const presentation = bookType(catalog, type).presentation
  const View = (views.get(presentation) ?? fail("E109", { kind: "presentation", id: presentation })).view
  return <View stage={id} />
}
