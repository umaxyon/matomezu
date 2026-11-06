// 既読の伝言のまとめ方: AI が読んだ伝言は、付けた物の最後の 1 つ（チェックを出す物）ごとに 1 つのチェックにまとめ、右サイドパネルに新しい順に並べる。
// 並びはデータの付ける先と付けた時点で決める（付けた時点が同じなら、アノテーションの並びで後ろの物を新しいとする）
import type { Annotation } from "../../../core/annotation"
import type { NoteProps } from "."

// 既読の伝言 notes を、チェックを出す物の id ごとに、新しい順に並べた表（並びの順は、チェックを出す物が最初に現れた順）
export function readNotesByAnchor(notes: readonly Annotation[]): ReadonlyMap<string, readonly Annotation[]> {
  const groups = new Map<string, { note: Annotation; at: number }[]>()
  notes.forEach((note, at) => {
    const anchor = note.anchors.at(-1)
    if (anchor === undefined || (note.props as NoteProps).readAt === undefined) return
    const group = groups.get(anchor) ?? []
    group.push({ note, at })
    groups.set(anchor, group)
  })
  const newest = (a: { note: Annotation; at: number }, b: { note: Annotation; at: number }) => {
    const x = (a.note.props as NoteProps).addedAt
    const y = (b.note.props as NoteProps).addedAt
    return x === y ? b.at - a.at : x < y ? 1 : -1
  }
  return new Map([...groups].map(([anchor, group]) => [anchor, group.sort(newest).map(g => g.note)]))
}
