// ステージのレイヤー（スロット book-layers に置くウィジェット）: 紙の白い面を描くレイヤーと、印刷区画の区切りの線を描くレイヤーと、開いたページをそのタイプが選んだプレゼンテーションのビューで描くレイヤー。
// 紙の面と区切りの線は紙の座標の枠（PaperFrame）に描き、ポインタは受けない（上のレイヤーとステージが受ける）。ページが無い・紙を出せないときは描かない（紙の知らせは BookContentLayer が出す）

import { type ReactNode, useLayoutEffect, useMemo } from "react"
import { pageType } from "../../../core/core-catalog"
import { fail } from "../../../core/errors"
import type { ResolvedPaper } from "../../../core/paper"
import { areaOf, openedPage, paperOf } from "../../../core/stage"
import type { StageView } from "../../../core/workspace"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { useActions, usePage, useStage } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { printAreaLines } from "../place/grow"
import { startOf, unprintedSheets } from "../print-preview/entry-sheets"
import { sheetKey } from "../print-preview/filled"
import { PaperFrame } from "../utils/PaperFrame"
import { useContentHidden } from "./background-state"
import styles from "./layers.module.css"
import { usePrintAreasHidden } from "./print-areas"

export function PaperLayer() {
  const stage = useStage()
  if (!openedPage(stage?.opened ?? null) || !stage) return null
  return <PaperFrame stage={stage} className={styles.paper} aria-hidden="true" data-paper-surface />
}

// 可変ページの、印刷区画の境目の破線と、印刷しない印刷区画（何も載っていない印刷区画。印刷プレビューに並べない物と同じ）の薄い影
// （プレゼンテーションが知らせた広さが紙 1 枚より大きいときだけ。番号は出さない。フッタメニューのボタンで、線と影を一緒に隠せる）。
// 初めの位置（暗くしない所の左上）も、ここからステージに知らせる
export function PrintAreaLayer() {
  const stage = useStage()
  const page = usePage()
  const catalog = useCatalog().core
  const paper = stage && paperOf(stage)
  const area = stage && areaOf(stage)
  const hidden = usePrintAreasHidden()
  const lines = paper && area && !hidden ? printAreaLines(paper, area) : null
  const columns = lines?.columns ?? 0
  const rows = lines?.rows ?? 0
  const unprinted = useMemo(
    () => (columns > 0 && page ? unprintedSheets(catalog, page, columns, rows) : []),
    [catalog, page, columns, rows],
  )
  useStartReport()
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

// ステージに、初めの位置で表示領域の左上に置く紙の点（startOf。暗くしない印刷区画の左上）を知らせる。
// ステージは開くたびに知らされた点を捨てるので、開いているもの（opened）が替わるたびにも知らせ直す（同じ点なら、ステージは変わらない）
function useStartReport() {
  const { setStageStart } = useActions()
  const catalog = useCatalog().core
  const page = usePage()
  const opened = useStage()?.opened
  const start = useMemo(() => (page ? startOf(catalog, page) : null), [catalog, page])
  const x = start?.x
  const y = start?.y
  useLayoutEffect(() => {
    if (x !== undefined && y !== undefined && openedPage(opened ?? null)?.paper) setStageStart({ x, y })
  }, [setStageStart, x, y, opened])
}

// ブックの中身のレイヤー。開いたページのプレゼンテーションのビューと、紙の知らせ（PaperNotice）を描く。
// 背景編集モードの間は、中身を薄くして触れなくする（中身を隠していれば描かない）。背景は、この下のレイヤー（slide-layer）が描いて操作を受ける
export function BookContentLayer() {
  const stage = useStage()
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const hidden = useContentHidden()
  const opened = openedPage(stage?.opened ?? null)
  if (!opened || !stage) return null
  const presentation = pageType(catalog, opened.type).presentation
  const View = (views.get(presentation) ?? fail("E109", { kind: "presentation", id: presentation })).view
  const content = <PaperNotice stage={stage} paper={opened.paper} view={<View />} />
  if (stage.edits !== "slide") return content
  return (
    <div className={styles.dimmed} data-content-dimmed data-content-hidden={hidden}>
      {content}
    </div>
  )
}

// 紙の知らせとビュー view: 表に無い紙なら紙の左上に印（ビューの下に重ねる。ポインタは受けず、右クリックなどはビューが受ける）。
// 紙を置かないプレゼンテーション（paper が null）には出さない
function PaperNotice({ stage, paper, view }: { stage: StageView; paper: ResolvedPaper | null; view: ReactNode }) {
  const t = useMessages(kit)
  if (paper?.status !== "unknown") return view
  return (
    <>
      <PaperFrame stage={stage} className={styles.notice}>
        <span className={styles.unknown}>{t("Unknown paper")}</span>
      </PaperFrame>
      {view}
    </>
  )
}
