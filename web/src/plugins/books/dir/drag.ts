// 行のドラッグで落とす先: 紙の上の点に、どのフォルダの中の何番目として入るか（付け替えと、並びの入れ替え）と、その印。
// フォルダの行の真ん中に落とせば、その中の末尾へ（閉じたフォルダは閉じたまま）。行の上の端なら、その行の前へ。下の端なら、その行の後ろへ
// （中身の見えている開いたフォルダの下の端は、その中の先頭へ）。ファイルの行は上半分で前、下半分で後ろ。根の行は中へだけ。
// 動かす行と、その中身の行には落とせない
import type { Point } from "../../../plugin-api"
import { entryOf, pathTo } from "./edit"
import type { DirEntry, DirFolder } from "./entry"
import type { LaidRow } from "./layout"

export interface Drop {
  parent: string
  index?: number // 動かす中身を除いた並びの何番目（無ければ末尾）
  // 印: 中へ入るフォルダの行（into）か、行の間に入る所の線（between）
  mark: { kind: "into"; entry: string } | { kind: "between"; from: Point; to: Point }
}

// フォルダの行の端から、前か後ろへ入る範囲（行の高さの割合）
const EDGE = 0.25
// 行の間に入る所の線の右の端（行の右から）
const LINE_PAST = 24

// 中身 e と、その中身の id
export function subtreeIds(e: DirEntry): Set<string> {
  const ids = new Set<string>([e.id])
  if (e.kind === "folder") for (const c of e.children ?? []) for (const id of subtreeIds(c)) ids.add(id)
  return ids
}

// 根 root を並べた行 rows の上で、中身 dragged を点 at（紙の座標）に落とす先（落とせなければ null）
export function dropAt(root: DirFolder, rows: readonly LaidRow[], dragged: string, at: Point): Drop | null {
  const moving = entryOf(root, dragged)
  if (!moving || dragged === root.id) return null
  const skip = subtreeIds(moving)
  const r = rows.find(row => at.y >= row.y && at.y < row.y + row.h)
  if (!r || skip.has(r.id)) return null
  const e = entryOf(root, r.id)
  if (!e) return null
  const t = (at.y - r.y) / r.h
  const line = (y: number, x: number) => ({
    kind: "between" as const,
    from: { x, y },
    to: { x: r.x + r.w + LINE_PAST, y },
  })
  if (e.kind === "folder" && (r.id === root.id || (t >= EDGE && t <= 1 - EDGE)))
    return { parent: e.id, mark: { kind: "into", entry: e.id } }
  const before = e.kind === "folder" ? t < EDGE : t < 0.5
  if (!before && e.kind === "folder" && !e.closed && (e.children?.length ?? 0) > 0) {
    const first = rows[rows.indexOf(r) + 1]
    return { parent: e.id, index: 0, mark: line(r.y + r.h, first?.x ?? r.x) }
  }
  const parent = pathTo(root, r.id)?.at(-1)
  if (!parent) return null
  const kids = (parent.children ?? []).filter(c => c.id !== dragged)
  const i = kids.findIndex(c => c.id === r.id)
  return { parent: parent.id, index: before ? i : i + 1, mark: line(before ? r.y : r.y + r.h, r.x) }
}
