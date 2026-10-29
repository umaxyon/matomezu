// ディレクトリ構成図の並べ方: 根のフォルダと中身の入れ子から、紙の上の行と罫線を決める（データに位置は持たない）。
// 上から下へ 1 行ずつ並べ、中身は深さごとに字下げする（閉じたフォルダの中身は並べない）。行は、アイコンとその右の名前（1 行。折り返さない）。
// 罫線は、フォルダのアイコンの真ん中から下へ、最後の中身の行まで縦に引き、そこから中身ごとにアイコンの手前まで横に引く。
// フォルダの開け閉めの印（▸・▾）は、その行へ横に引く線の付け根（根は、根のアイコンの左）に置く
import type { Point } from "../../../plugin-api"
import { parseRich, type RichLine, richWidth, TEXT_LOOK } from "../../base"
import { rowsOf } from "./edit"
import type { DirFolder, Kind } from "./entry"

export const MARGIN = 24 // 紙の辺と、いちばん外の行の間
export const ROW = 24 // 1 行の高さ
export const INDENT = 24 // 1 段の字下げ
export const ICON = 16 // アイコンの大きさ
const NAME_GAP = 6 // アイコンと名前の間
const TICK_GAP = 3 // 横の罫線の端と、アイコンの間

// 名前の字（標準は普通の太さ。**…** で囲んだ所が太字）
const FONT = { size: TEXT_LOOK.caption.size, weight: 400 } as const

export interface LaidRow {
  id: string
  kind: Kind
  name: string
  line: RichLine // 見せる名前（装飾の区切りの並び）
  color?: string
  closed: boolean // 閉じたフォルダ
  hasKids: boolean // 中身のあるフォルダ
  x: number // アイコンの左
  y: number // 行の上
  w: number // アイコンから名前の右まで
  h: number
  toggle: Point | null // 開け閉めの印の真ん中（フォルダだけ）
}

export interface DirLayout {
  rows: LaidRow[]
  lines: { from: Point; to: Point }[] // 罫線（縦か横の線分）
  fits: boolean // どの行も紙に収まるか
}

// 深さ depth の行のアイコンの左
const iconX = (depth: number) => MARGIN + INDENT + depth * INDENT

// 名前の幅
export const nameWidth = (name: string): number => {
  const [line] = parseRich(name.replace(/\n/g, " "))
  return Math.ceil(richWidth(line ?? [], FONT))
}

// 名前の行の左（アイコンの左 x から）
export const nameLeft = (x: number): number => x + ICON + NAME_GAP

// 根 root を大きさ paper の紙に並べる
export function layoutDir(root: DirFolder, paper: { w: number; h: number }): DirLayout {
  const rows = rowsOf(root)
  const laid = rows.map(({ entry, depth }, i): LaidRow => {
    const x = iconX(depth)
    const y = MARGIN + i * ROW
    const [line] = parseRich(entry.name.replace(/\n/g, " "))
    const folder = entry.kind === "folder" ? entry : null
    return {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      line: line ?? [],
      ...(entry.color ? { color: entry.color } : {}),
      closed: folder?.closed === true,
      hasKids: (folder?.children?.length ?? 0) > 0,
      x,
      y,
      w: ICON + NAME_GAP + nameWidth(entry.name),
      h: ROW,
      toggle: folder ? { x: x - INDENT + ICON / 2, y: y + ROW / 2 } : null,
    }
  })
  const at = new Map(rows.map((r, i) => [r.entry.id, i]))
  const lines: DirLayout["lines"] = []
  for (const [i, r] of rows.entries()) {
    const row = laid[i]
    if (!row) continue
    if (r.depth > 0) {
      const from = { x: row.x - INDENT + ICON / 2, y: row.y + ROW / 2 }
      lines.push({ from, to: { x: row.x - TICK_GAP, y: from.y } })
    }
    const kids = r.entry.kind === "folder" && !r.entry.closed ? (r.entry.children ?? []) : []
    const last = kids.at(-1)
    const end = last ? laid[at.get(last.id) ?? -1] : undefined
    if (end) {
      const x = row.x + ICON / 2
      lines.push({ from: { x, y: row.y + ROW / 2 + ICON / 2 }, to: { x, y: end.y + ROW / 2 } })
    }
  }
  const fits = laid.every(r => r.x + r.w <= paper.w - MARGIN && r.y + r.h <= paper.h - MARGIN)
  return { rows: laid, lines, fits }
}
