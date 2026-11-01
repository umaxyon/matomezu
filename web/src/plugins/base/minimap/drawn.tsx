// 紙に描いたつなぐもののミニマップの絵（base が持つステージの画面の状態。つなぐものの種類の id ごと）。
// つなぐもののビューは描くたびに、描いた形からミニマップの絵を作って useDrawnMinimap で置く。ミニマップは置いた絵があればそれを描き、
// 無ければ（まだ描いていない・別のページを描いた絵）定義の minimap で作る
import { useLayoutEffect } from "react"
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { MinimapMark } from "./marks"

// 種類の id → 描いたページの id と絵
export type DrawnTable = Readonly<Record<string, { page: string; marks: readonly MinimapMark[] }>>
const NONE: DrawnTable = {}
const tableOf = (value: unknown): DrawnTable => (value as { drawn?: DrawnTable } | undefined)?.drawn ?? NONE

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

// つなぐもの item のビューが、ステージ stage のページ page に描いた絵 marks を置く（null なら置き直さない。形を動かしている間など）。
// 前と同じ絵なら置き直さない。ビューが消えたら絵も消す。置いた絵は購読しない（置くたびにビューが描き直されないように）
export function useDrawnMinimap(stage: string, item: string, page: string, marks: readonly MinimapMark[] | null) {
  const setStageState = useSetStageState(kit)
  const read = useReadStageState(kit)
  useLayoutEffect(() => {
    if (!marks) return
    const state = (read(stage) ?? {}) as Record<string, unknown>
    const table = tableOf(state)
    const now = table[item]
    if (now?.page === page && sameMarks(now.marks, marks)) return
    setStageState(stage, { ...state, drawn: { ...table, [item]: { page, marks } } })
  })
  useLayoutEffect(
    () => () => {
      const state = (read(stage) ?? {}) as Record<string, unknown>
      const { [item]: _, ...rest } = tableOf(state)
      setStageState(stage, { ...state, drawn: rest })
    },
    [read, setStageState, stage, item],
  )
}

// ステージ stage に置いた絵の表。置き直すまで同じ表を返す
export const useDrawnTable = (stage: string): DrawnTable => tableOf(useStageState(stage, kit))

// 表 table の、つなぐもの item がページ page に描いた絵（無ければ undefined）
export function drawnOn(table: DrawnTable, item: string, page: string): readonly MinimapMark[] | undefined {
  const d = table[item]
  return d?.page === page ? d.marks : undefined
}
