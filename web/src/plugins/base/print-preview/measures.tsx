// 測る見せ方（printMeasure）が知らせた、ページごとの測った結果（base が持つステージのプラグイン状態 print-measures。開いたブックごとに 1 つ）。
// 印刷プレビューのビューが読んで並べ方（bookSheets）に渡し、印刷区画 1 つのビューに data を渡す。ほかのブックの結果は読まない
import { useCallback } from "react"
import { usePluginState, useReadPluginState, useSetPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { PRINT_MEASURES, type PrintMeasured } from "./measures-state"
import { PRINT_READY_STATE } from "./print-state"

const NONE: Readonly<Record<string, PrintMeasured>> = {}

// ステージ stage で、ブック book のページを測った結果（まだ無ければ空。置き直すまで同じ表を返す）
export function useMeasures(book: string | undefined): Readonly<Record<string, PrintMeasured>> {
  const m = usePluginState(kit, PRINT_MEASURES)
  return m && m.book === book ? m.pages : NONE
}

// ステージ stage で、ブック book のページ page を測った結果を置く関数（同じ結果なら置き直さない。ほかのブックの結果は捨てる）
export function useReportMeasure(stage: string, book: string | undefined): (page: string, m: PrintMeasured) => void {
  const read = useReadPluginState(kit, PRINT_MEASURES)
  const set = useSetPluginState(kit, PRINT_MEASURES)
  return useCallback(
    (page, m) => {
      if (!book) return
      const now = read(stage)
      const pages = now?.book === book ? now.pages : NONE
      const was = pages[page]
      if (was && was.rows === m.rows && JSON.stringify(was.data) === JSON.stringify(m.data)) return
      set(stage, { book, pages: { ...pages, [page]: m } })
    },
    [read, set, stage, book],
  )
}

// ステージ stage に、刷れるかを置く（print-state.ts。前と同じなら置き直さない）
export function useSetPrintReady(stage: string): (ready: boolean) => void {
  const read = useReadPluginState(kit, PRINT_READY_STATE)
  const set = useSetPluginState(kit, PRINT_READY_STATE)
  return useCallback(
    ready => {
      if ((read(stage) ?? false) === ready) return
      set(stage, ready ? true : undefined)
    },
    [read, set, stage],
  )
}
