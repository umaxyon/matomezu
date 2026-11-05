// 測る見せ方（printMeasure）が知らせた、ページごとの測った結果（base が持つステージの画面の状態。開いたブックごとに 1 つ）。
// 印刷プレビューのビューが読んで並べ方（bookSheets）に渡し、印刷区画 1 つのビューに data を渡す。ほかのブックの結果は読まない
import { useCallback } from "react"
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { PrintMeasured } from "./PrintPreviewView"
import { printReadyOf, withPrintReady } from "./print-state"

// 測ったブックの id と、ページの id → 測った結果
interface Measures {
  book: string
  pages: Readonly<Record<string, PrintMeasured>>
}
const NONE: Readonly<Record<string, PrintMeasured>> = {}
const measuresOf = (value: unknown): Measures | undefined =>
  (value as { printMeasures?: Measures } | undefined)?.printMeasures

// ステージ stage で、ブック book のページを測った結果（まだ無ければ空。置き直すまで同じ表を返す）
export function useMeasures(stage: string, book: string | undefined): Readonly<Record<string, PrintMeasured>> {
  const m = measuresOf(useStageState(stage, kit))
  return m && m.book === book ? m.pages : NONE
}

// ステージ stage で、ブック book のページ page を測った結果を置く関数（同じ結果なら置き直さない。ほかのブックの結果は捨てる）
export function useReportMeasure(stage: string, book: string | undefined): (page: string, m: PrintMeasured) => void {
  const read = useReadStageState(kit)
  const set = useSetStageState(kit)
  return useCallback(
    (page, m) => {
      if (!book) return
      const state = (read(stage) ?? {}) as Record<string, unknown>
      const now = measuresOf(state)
      const pages = now?.book === book ? now.pages : NONE
      const was = pages[page]
      if (was && was.rows === m.rows && JSON.stringify(was.data) === JSON.stringify(m.data)) return
      set(stage, { ...state, printMeasures: { book, pages: { ...pages, [page]: m } } })
    },
    [read, set, stage, book],
  )
}

// ステージ stage に、刷れるかを置く（print-state.ts。前と同じなら置き直さない）
export function useSetPrintReady(stage: string): (ready: boolean) => void {
  const read = useReadStageState(kit)
  const set = useSetStageState(kit)
  return useCallback(
    ready => {
      const state = read(stage)
      if (printReadyOf(state) === ready && state !== undefined) return
      set(stage, withPrintReady(state, ready))
    },
    [read, set, stage],
  )
}
