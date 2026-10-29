// ディレクトリ構成図の並べ方: 根のフォルダと中身の入れ子から、紙の上の行と罫線を決める（データに位置は持たない）。
// 上から下へ 1 行ずつ並べ、中身は深さごとに字下げする（閉じたフォルダの中身は並べない）。行は、アイコンとその右の名前（1 行。折り返さない）。
// 罫線は、フォルダのアイコンの真ん中から下へ、最後の中身の行まで縦に引き、そこから中身ごとにアイコンの手前まで横に引く。
// フォルダの開け閉めの印（▸・▾）は、その行へ横に引く線の付け根（根は、根のアイコンの左）に置く。
// 説明は、いちばん右まで伸びた行の右から NOTE_GAP 空けた所に、どの行もそろえて 1 行で置く。紙の右に収まらない分は … で切り、
// 行が紙の幅の NOTE_LIMIT を超えて右へ伸びていれば、説明はどれも出さない。
// ページの設定の項目（notes.ts）で、説明を出さない・説明の前に「・・・」を付ける・説明の列の左から DIVIDER_GAP 空けた所に紙を縦に分ける区切り線を引く、を選べる
import type { Point } from "../../../plugin-api"
import { clampRich, parseRich, type RichLine, richWidth, TEXT_LOOK, textWidth, wrapRich } from "../../base"
import { rowsOf } from "./edit"
import type { DirFolder, Kind } from "./entry"
import type { NoteLook } from "./notes"

export const MARGIN = 24 // 紙の辺と、いちばん外の行の間
export const ROW = 24 // 1 行の高さ
export const INDENT = 24 // 1 段の字下げ
export const ICON = 16 // アイコンの大きさ
const NAME_GAP = 6 // アイコンと名前の間
const TICK_GAP = 3 // 横の罫線の端と、アイコンの間
export const NOTE_GAP = 70 // いちばん右まで伸びた行と、説明の間
export const NOTE_LIMIT = 0.8 // 行がこの割合より紙の右へ伸びたら、説明を出さない
export const DIVIDER_GAP = 10 // 区切り線と、説明の列の左の間
const DOTS = "・・・ " // 説明の前に付ける印

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
  note: RichLine | null // 見せる説明（装飾の区切りの並び。… で切った物。無い・出さないなら null）
}

export interface DirLayout {
  rows: LaidRow[]
  lines: { from: Point; to: Point }[] // 罫線（縦か横の線分）
  notes: { x: number; w: number } | null // 説明の列の左と幅（出さないなら null）
  divider: { from: Point; to: Point } | null // 紙を縦に分ける区切り線（上下は紙の辺から MARGIN 空ける。引かないなら null）
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

// その場の編集のテキストFormの幅: 見せている名前の幅 shown か、記号も含めて書いた字 raw の幅の広いほうに、余白とテキストFormの枠を足す
export const editorWidth = (raw: string, shown: number): number =>
  Math.max(shown, Math.ceil(textWidth(raw, FONT))) + EDITOR_PAD * 2 + 16
const EDITOR_PAD = 4

const NOTE_DEFAULT: NoteLook = { shown: true, dots: false, divider: false }

// 根 root を大きさ paper の紙に並べる（look は説明の見せ方。無ければ既定）
export function layoutDir(root: DirFolder, paper: { w: number; h: number }, look: NoteLook = NOTE_DEFAULT): DirLayout {
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
      note: null,
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
  const notes = look.shown ? notesOf(laid, paper.w) : null
  if (notes)
    for (const [i, r] of rows.entries()) {
      const row = laid[i]
      const text = r.entry.description?.replace(/\n/g, " ")
      const shown = text && (look.dots ? DOTS + text : text)
      if (row && shown) row.note = clampRich(wrapRich(shown, notes.w, FONT), 1, notes.w, FONT)[0] ?? null
    }
  const x = notes ? notes.x - DIVIDER_GAP : 0
  const divider = notes && look.divider ? { from: { x, y: MARGIN }, to: { x, y: paper.h - MARGIN } } : null
  return { rows: laid, lines, notes, divider, fits }
}

// 説明の列（いちばん右まで伸びた行の右から NOTE_GAP。紙の右の余白まで）。行が紙の幅の NOTE_LIMIT を超えて伸びた・列の幅が無ければ null
function notesOf(rows: readonly LaidRow[], paperW: number): { x: number; w: number } | null {
  const right = Math.max(...rows.map(r => r.x + r.w))
  const x = right + NOTE_GAP
  const w = paperW - MARGIN - x
  return right > paperW * NOTE_LIMIT || w <= 0 ? null : { x, w }
}
