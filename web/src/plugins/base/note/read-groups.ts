// 既読の伝言のまとめ方: AI が読んだ伝言は、付けた物の最後の 1 つ（チェックを出す物）ごとに 1 つのチェックにまとめ、右サイドパネルに新しい順に並べる。
// 並びはデータの付ける先と付けた時点で決める（付けた時点が同じなら、アノテーションの並びで後ろの物を新しいとする）。
// 物の右上の角には、たたんだ未読の伝言の絵と既読のチェックを、物ごとに 1 つの並びにして出す（重ならないように）
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

// 開いていた既読の伝言が無くなったとき、代わりに開く伝言: 残った伝言 notes のうち、物 anchor にチェックを出すいちばん新しい既読の伝言（無ければ undefined）
export const nextReadNote = (notes: readonly Annotation[], anchor: string): Annotation | undefined =>
  readNotesByAnchor(notes).get(anchor)?.[0]

// 物の右上の角に出す物: たたんだ未読の伝言（アノテーションの並びの順）と、既読の伝言（新しい順。無ければ空）
export interface CornerNotes {
  folded: readonly Annotation[]
  read: readonly Annotation[]
}

// 伝言 notes を、物の右上の角に出す物ごとに分けた表（並びの順は、物が最初に現れた順）
export function cornerNotesByAnchor(notes: readonly Annotation[]): ReadonlyMap<string, CornerNotes> {
  const read = readNotesByAnchor(notes)
  const corners = new Map<string, { folded: Annotation[]; read: readonly Annotation[] }>()
  for (const note of notes) {
    const anchor = note.anchors.at(-1)
    if (anchor === undefined) continue
    const props = note.props as NoteProps
    const folded = props.readAt === undefined && !props.bubble
    if (!folded && props.readAt === undefined) continue
    const corner = corners.get(anchor) ?? { folded: [], read: read.get(anchor) ?? [] }
    if (folded) corner.folded.push(note)
    corners.set(anchor, corner)
  }
  return corners
}
