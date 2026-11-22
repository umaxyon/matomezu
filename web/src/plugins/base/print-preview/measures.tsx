// 測るプレゼンテーション（printMeasure）が知らせた、ページごとの測った結果（base が持つステージのプラグイン状態 print-measures。開いたステージエントリごとに 1 つ）。
// 印刷プレビューのビューが読んで並べ方（entrySheets）に渡し、印刷区画 1 つのビューに data を渡す。ほかのステージエントリの結果は読まない
import { useCallback } from "react"
import { usePluginState, useReadPluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { kit } from "../kit"
import { PRINT_MEASURES, type PrintMeasured } from "./measures-state"
import { PRINT_READY_STATE } from "./print-state"

const NONE: Readonly<Record<string, PrintMeasured>> = {}

// 描いている場所のステージで、ステージエントリ entry のページを測った結果（まだ無ければ空。置き直すまで同じ表を返す）
export function useMeasures(entry: string | undefined): Readonly<Record<string, PrintMeasured>> {
  const m = usePluginState(kit, PRINT_MEASURES)
  return m && m.entry === entry ? m.pages : NONE
}

// 描いている場所のステージで、ステージエントリ entry のページ page を測った結果を置く関数（同じ結果なら置き直さない。ほかのステージエントリの結果は捨てる）
export function useReportMeasure(entry: string | undefined): (page: string, m: PrintMeasured) => void {
  const read = useReadPluginState(kit, PRINT_MEASURES)
  const set = useSetPluginState(kit, PRINT_MEASURES)
  return useCallback(
    (page, m) => {
      if (!entry) return
      const now = read()
      const pages = now?.entry === entry ? now.pages : NONE
      const was = pages[page]
      if (was && was.rows === m.rows && JSON.stringify(was.data) === JSON.stringify(m.data)) return
      set({ entry, pages: { ...pages, [page]: m } })
    },
    [read, set, entry],
  )
}

// 描いている場所のステージに、刷れるかを置く（print-state.ts。前と同じなら置き直さない）
export function useSetPrintReady(): (ready: boolean) => void {
  const read = useReadPluginState(kit, PRINT_READY_STATE)
  const set = useSetPluginState(kit, PRINT_READY_STATE)
  return useCallback(
    ready => {
      if ((read() ?? false) === ready) return
      set(ready ? true : undefined)
    },
    [read, set],
  )
}
