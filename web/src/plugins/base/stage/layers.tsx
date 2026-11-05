// ステージのレイヤー（スロット book-layers に置くウィジェット）: 紙の白い面を描くレイヤーと、印刷区画の区切りの線を描くレイヤーと、開いたブックをそのタイプが選んだ見せ方のビューで描くレイヤー。
// 紙の面と区切りの線は紙の座標の枠（PaperFrame）に描き、ポインタは受けない（上のレイヤーとステージが受ける）。ページが無い・紙を出せないときは描かない（知らせはブックのビューが出す）

import { useMemo } from "react"
import { bookType } from "../../../core/core-catalog"
import { fail } from "../../../core/errors"
import { areaOf, paperOf } from "../../../core/stage"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { useBook, usePage, useStage } from "../../../ui/view-hooks"
import { printAreaLines } from "../place/grow"
import { unprintedSheets } from "../print-preview/book-sheets"
import { sheetKey } from "../print-preview/filled"
import { PaperFrame } from "../utils/PaperFrame"
import type { StageSlotProps } from "../workspace/ui"
import styles from "./layers.module.css"
import { usePrintAreasHidden } from "./print-areas"

export function PaperLayer({ stage: id }: StageSlotProps) {
  const stage = useStage(id)
  if (!stage?.opened || stage.opened.page === null) return null
  return <PaperFrame stage={stage} className={styles.paper} aria-hidden="true" data-paper-surface />
}

// 可変ページの、印刷区画の境目の破線と、印刷しない印刷区画（何も載っていない印刷区画。印刷プレビューに並べない物と同じ）の薄い影
// （見せ方が知らせた広さが紙 1 枚より大きいときだけ。番号は出さない。フッタメニューのボタンで、線と影を一緒に隠せる）
export function PrintAreaLayer({ stage: id }: StageSlotProps) {
  const stage = useStage(id)
  const book = useBook(id)
  const page = usePage(id)
  const catalog = useCatalog().core
  const paper = stage && paperOf(stage)
  const area = stage && areaOf(stage)
  const hidden = usePrintAreasHidden(id)
  const lines = paper && area && !hidden ? printAreaLines(paper, area) : null
  const columns = lines?.columns ?? 0
  const rows = lines?.rows ?? 0
  const unprinted = useMemo(
    () => (columns > 0 && book && page ? unprintedSheets(catalog, book, page, columns, rows) : []),
    [catalog, book, page, columns, rows],
  )
  if (!stage || !area || !paper || !lines) return null
  const { xs, ys } = lines
  return (
    <PaperFrame stage={stage} className={styles.printAreas} aria-hidden="true" data-print-areas={`${columns}x${rows}`}>
      <svg width={area.w} height={area.h} className={styles.printAreaLines} aria-hidden="true">
        {unprinted.map(c => (
          <rect
            key={`u${c.column},${c.row}`}
            className={styles.unprinted}
            x={c.column * paper.w}
            y={c.row * paper.h}
            width={paper.w}
            height={paper.h}
            data-unprinted={sheetKey(c.column, c.row)}
          />
        ))}
        {xs.map(x => (
          <line key={`x${x}`} x1={x} y1={0} x2={x} y2={area.h} />
        ))}
        {ys.map(y => (
          <line key={`y${y}`} x1={0} y1={y} x2={area.w} y2={y} />
        ))}
      </svg>
    </PaperFrame>
  )
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
