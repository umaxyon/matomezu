// 紙に描いたつなぐもののミニマップの絵（base が持つステージのプラグイン状態 minimap-drawn。つなぐものの種類の id ごと）。
// つなぐもののビューは描くたびに、描いた形からミニマップの絵を作って useDrawnMinimap で置く。ミニマップは置いた絵があればそれを描き、
// 無ければ（まだ描いていない・別のページを描いた絵）定義の minimap で作る

import { useLayoutEffect } from "react"
import {
  usePluginState,
  useReadPluginState,
  useResetPluginState,
  useSetPluginState,
} from "../../../ui/plugin-state-hooks"
import { kit } from "../kit"
import { usePrinting } from "../print-preview/printing"
import { type MinimapMark, NOT_DRAWN } from "./marks"
import { type DrawnTable, MINIMAP_DRAWN } from "./states"

export type { DrawnTable }

const samePoints = (a: MinimapMark, b: MinimapMark): boolean => {
  if (a.kind !== b.kind) return false
  if (a.kind === "polyline" || a.kind === "polygon") {
    const q = (b as typeof a).points
    return a.points.length === q.length && a.points.every((p, i) => p.x === q[i]?.x && p.y === q[i]?.y)
  }
  return JSON.stringify(a) === JSON.stringify(b)
}
const sameMarks = (a: readonly MinimapMark[], b: readonly MinimapMark[]): boolean =>
  a.length === b.length && a.every((m, i) => samePoints(m, b[i] as MinimapMark))

// 置いた絵を置き直さないときの、useDrawnMinimap の marks
export const KEEP_DRAWN = "keep"

// つなぐもの item のビューが、向け先のステージのページ page に描いた絵 marks を置く（KEEP_DRAWN なら置き直さない。形を動かしている間など。向け先がステージでなければ何も置かない）。
// 前と同じ絵なら置き直さない。ビューが消えたら絵も消す。置いた絵は購読しない（置くたびにビューが描き直されないように）。
// 印刷区画の中で描いたビュー（印刷区画ごとに、寄せた位置で描く）は、置きも消しもしない（編集のミニマップの絵を上書きしないように）
export function useDrawnMinimap(item: string, page: string, marks: readonly MinimapMark[] | typeof KEEP_DRAWN): void {
  const set = useSetPluginState(kit, MINIMAP_DRAWN)
  const read = useReadPluginState(kit, MINIMAP_DRAWN)
  const reset = useResetPluginState(kit, MINIMAP_DRAWN)
  const printing = usePrinting() // 印刷区画の中で描いているか
  useLayoutEffect(() => {
    if (marks === KEEP_DRAWN || printing) return
    const table = read()
    const now = table[item]
    if (now?.page === page && sameMarks(now.marks, marks)) return
    set({ ...table, [item]: { page, marks } })
  })
  useLayoutEffect(
    () => () => {
      if (printing) return
      const { [item]: gone, ...rest } = read()
      if (!gone) return
      if (Object.keys(rest).length === 0) reset()
      else set(rest)
    },
    [read, set, reset, item, printing],
  )
}

// 描いている場所のステージに置いた絵の表。置き直すまで同じ表を返す
export const useDrawnTable = (): DrawnTable => usePluginState(kit, MINIMAP_DRAWN)

// 表 table の、つなぐもの item がページ page に描いた絵（無ければ NOT_DRAWN）
export function drawnOn(table: DrawnTable, item: string, page: string): readonly MinimapMark[] | typeof NOT_DRAWN {
  const d = table[item]
  return d?.page === page ? d.marks : NOT_DRAWN
}
