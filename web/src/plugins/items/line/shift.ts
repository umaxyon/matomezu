// 形ごとページの中身をずらしたときの線（可変ページで、中身を印刷区画の単位でずらすとき。base の alignPadding が呼ぶ）
import type { Point } from "../../../plugin-api"
import type { PortArea } from "../../base"
import { pointAt } from "./geom"
import type { LineLike } from "./placed"
import { sideOf } from "./route"
import { perimeter } from "./selfloop"

// 線 lines を、形と一緒に d だけずらす: 手で直した途中の区間の位置（via）も同じだけずらす（via は、出る辺と交わる向きの座標から、x と y を交互に持つ）。
// areas はずらす前の形のつながる範囲。via の無い線はそのまま返す
export function shiftLines<L extends LineLike>(
  lines: readonly L[],
  areas: ReadonlyMap<string, PortArea>,
  d: Point,
): L[] {
  return lines.map(l => {
    const { via, exitAt } = l.props
    const from = areas.get(l.from)
    if (!via || exitAt === undefined || !from) return l
    const side = sideOf(from, pointAt(perimeter(from), exitAt))
    const startsWithX = side === "l" || side === "r"
    return { ...l, props: { ...l.props, via: via.map((v, i) => v + ((i % 2 === 0) === startsWithX ? d.x : d.y)) } }
  })
}
