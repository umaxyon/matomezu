// 紙の規定と、ページの紙を描く大きさに決める操作

import type { CoreCatalog } from "./core-catalog"
import type { Orientation } from "./def/paper"
import { fail } from "./errors"
import type { Size } from "./geom"

// 紙の選び方の規定（紙は機能台帳の紙の id）。ページは allowed の中から選び、選ばなければ default と orientation。
// バインダの中のページは、紙と向きを最初のページとそろえる（バインダに入らないタイプのページは、1 枚ごとに選ぶ）
export interface PaperRule {
  allowed: readonly string[]
  default: string
  orientation: Orientation
}

// ページが持つ紙
export interface PaperChoice {
  paper: string
  orientation: Orientation
}

// 描く紙。unknown は表に無い紙（データの id はそのまま残し、表で一番大きい紙で描く）
export interface ResolvedPaper {
  status: "known" | "unknown"
  size: Size
}

function oriented(size: Size, orientation: Orientation): Size {
  const [short, long] = size.w <= size.h ? [size.w, size.h] : [size.h, size.w]
  return orientation === "portrait" ? { w: short, h: long } : { w: long, h: short }
}

const area = (s: Size) => s.w * s.h

// ページの紙を、描く大きさに決める（表に紙が 1 つも無ければ E131）
export function resolvePaper(catalog: CoreCatalog, choice: PaperChoice): ResolvedPaper {
  const def = catalog.papers.get(choice.paper)
  if (def) return { status: "known", size: oriented(def.size, choice.orientation) }
  const largest =
    [...catalog.parts.papers].sort((a, b) => area(b.size) - area(a.size))[0] ?? fail("E131", { paper: choice.paper })
  return { status: "unknown", size: oriented(largest.size, choice.orientation) }
}
