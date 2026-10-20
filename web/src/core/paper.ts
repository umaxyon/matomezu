// 紙の規定と、ページの紙を描く大きさに決める操作
import type { Orientation, PaperDef } from "./def/paper"
import type { Size } from "./geom"
import { PAPERS } from "./papers"

// 紙の選び方の規定（紙は PAPERS の id）。ページは allowed の中から選び、選ばなければ default と orientation。
// perPage が false なら、1 冊の紙と向きは最初のページで決まり、後のページも同じにする
export interface PaperRule {
  allowed: readonly string[]
  default: string
  orientation: Orientation
  perPage: boolean
}

// ページが持つ紙
export interface PaperChoice {
  paper: string
  orientation: Orientation
}

// 描く紙。unknown は表に無い紙（データの id はそのまま残し、表で一番大きい紙で描く）。
// unshowable は表のどの紙にも中身が入らず、描けないもの
export type ResolvedPaper = { status: "known" | "unknown"; size: Size } | { status: "unshowable" }

const byId = new Map<string, PaperDef>(PAPERS.map(p => [p.id, p]))
export const paperDef = (id: string): PaperDef | undefined => byId.get(id)

export function oriented(size: Size, orientation: Orientation): Size {
  const [short, long] = size.w <= size.h ? [size.w, size.h] : [size.h, size.w]
  return orientation === "portrait" ? { w: short, h: long } : { w: long, h: short }
}

const area = (s: Size) => s.w * s.h
const fits = (content: Size, paper: Size) => content.w <= paper.w && content.h <= paper.h

// ページの紙を、描く大きさに決める。content は中身が占める大きさ（表に無い紙を代わりの紙で描けるかに使う）
export function resolvePaper(choice: PaperChoice, content?: Size): ResolvedPaper {
  const def = paperDef(choice.paper)
  if (def) return { status: "known", size: oriented(def.size, choice.orientation) }
  const largest = [...PAPERS].sort((a, b) => area(b.size) - area(a.size))[0]
  if (!largest) return { status: "unshowable" }
  const size = oriented(largest.size, choice.orientation)
  return content && !fits(content, size) ? { status: "unshowable" } : { status: "unknown", size }
}
