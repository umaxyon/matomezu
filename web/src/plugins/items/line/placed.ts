// 線のデータと、ページの上での線の決まり: 線でつながった形の組の間隔、引ける相手、形が変わったあとの整え、関係の決まり
import { type ConnectorData, connectorsOf, type ItemPage, type PlacedOf, type PortArea } from "../../../plugin-api"
import { kit } from "./kit"
import type { LINE } from "./line"
import { route } from "./route"

export type PlacedLine = PlacedOf<typeof LINE.id>

// ページの線
export const linesOf = (page: ItemPage): PlacedLine[] =>
  connectorsOf(page).filter((i): i is PlacedLine => i.item === kit.name("connector-line"))
// 線の決まりが見る欄（置いたデータの型が決まる前の、線の定義からも呼ぶ）
type LineLike = ConnectorData<{
  caption?: string
  via?: number[]
  route?: "straight" | "elbow"
  exitAt?: number
  enterAt?: number
}>
export const BEND_MARGIN = 12 // 折れ線の途中の区間を、両端の形の辺から最低これだけ離す
export const LINK_GAP = 32 // 線でつながった 2 つの形の間隔の下限（線と端の形が見えるように）
export const CAPTION_GAP = 40 // その線にキャプションがあるときの間隔の下限（キャプション 1 行と上下の余白が入る）

const hasCaption = (line: LineLike): boolean => !!line.props.caption?.trim()
const pairKey = (a: string, b: string): string => (a < b ? `${a}\n${b}` : `${b}\n${a}`)

// 2 つの形の組の間隔の下限: 線でつながっていれば LINK_GAP、その線にキャプションがあれば CAPTION_GAP、つながっていなければ base。
// 自分に戻る線は組を作らない
export function lineGaps(lines: readonly LineLike[], base: number): (a: string, b: string) => number {
  const gaps = new Map<string, number>()
  for (const l of lines) {
    if (l.from === l.to) continue
    const k = pairKey(l.from, l.to)
    gaps.set(k, Math.max(gaps.get(k) ?? base, hasCaption(l) ? CAPTION_GAP : LINK_GAP))
  }
  return (a, b) => gaps.get(pairKey(a, b)) ?? base
}

// 形 from から to へ、もう 1 本引けるか: 同じ組（向きは問わない）には 1 本だけ。自分に戻る線は何本でも
export function canConnect(lines: readonly LineLike[], from: string, to: string): boolean {
  return from === to || !lines.some(l => pairKey(l.from, l.to) === pairKey(from, to))
}

// 形が動いた・大きさが変わったあとの線: 手で直した途中の区間（via）が引けなくなったら消す（端の形が無くなった線は、土台が先に消す）。
// rects は形のつながる範囲、elbow はページの既定が折れ線か。変わらない線はそのまま返す
export function tidyLines<L extends LineLike>(
  lines: readonly L[],
  rects: ReadonlyMap<string, PortArea>,
  elbow: boolean,
): L[] {
  return lines.flatMap(l => {
    const a = rects.get(l.from)
    const b = rects.get(l.to)
    if (!a || !b) return []
    if (!l.props.via) return [l]
    const { exitAt, enterAt, via } = l.props
    const drawn =
      l.from !== l.to &&
      !route({
        a,
        b,
        elbow: (l.props.route ?? (elbow ? "elbow" : "straight")) === "elbow",
        via,
        obstacles: [],
        margin: BEND_MARGIN,
        exitAt,
        enterAt,
        aVertex: a.midpoints ?? false,
        bVertex: b.midpoints ?? false,
      }).fix.clearVia
    if (drawn) return [l]
    const { via: _, ...props } = l.props
    return [{ ...l, props }]
  })
}

// 形を並べ直したあとの線: 端の固定（exitAt・enterAt）と手で直した途中の区間（via）を外し、並べ直した位置での一番よい形で描かせる。
// 外すものの無い線はそのまま返す
export function unpinLines<L extends LineLike>(lines: readonly L[]): L[] {
  return lines.map(l => {
    const { exitAt, enterAt, via, ...props } = l.props
    return exitAt === undefined && enterAt === undefined && via === undefined ? l : { ...l, props }
  })
}

// 線の関係の決まり: 両端が同じページの、つなげる形（connectable）にあり、同じ組に 2 本無い
export function linesHold(lines: readonly LineLike[], connectable: (id: string) => boolean): boolean {
  const pairs = new Set<string>()
  for (const l of lines) {
    if (!connectable(l.from) || !connectable(l.to)) return false
    if (l.from === l.to) continue
    const k = pairKey(l.from, l.to)
    if (pairs.has(k)) return false
    pairs.add(k)
  }
  return true
}
