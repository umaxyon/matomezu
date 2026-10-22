// 紙に収める押し合い（OVERHAUL の「紙に収める」）: 箱 1 つの左上か大きさが変わったとき、近づきすぎた相手を押してどける。
// 試しに並べずに計算だけで、押したあとの四角を出すか、収まらなければ null を返す純粋な関数。
// - 近づきすぎ: 横の離れと縦の離れが、どちらも間隔の下限（GAP）より小さい組（重なりも含む）
// - 押す向き: 変わる前の位置で、横と縦のうち離れていた方の向きに、相手を自分から遠ざける向きへだけ押す（押されて次の段へ回り込まない。引き寄せない）
// - 押すのは変わった箱から、押された箱がまた近づきすぎた相手…の列だけをたどる（ほかの箱は見ない）
// - 変わった箱そのものは動かさない。押した先が紙からはみ出す・変わった箱を押し返すなら、収まらない（null）
// - 変わる前から近づきすぎていた組（よそから来たデータ）は押さない
import type { Size } from "../../../../core/geom"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const GAP = 8 // 箱どうしの間隔の下限（線の無い箱）

type Axis = "x" | "y"
const LEN = { x: "w", y: "h" } as const

// a と b の axis の向きの離れ（重なっていれば負）
function apart(a: Rect, b: Rect, axis: Axis): number {
  const len = LEN[axis]
  return Math.max(b[axis] - (a[axis] + a[len]), a[axis] - (b[axis] + b[len]))
}

export const tooClose = (a: Rect, b: Rect, gap = GAP): boolean => apart(a, b, "x") < gap && apart(a, b, "y") < gap

const inPaper = (r: Rect, paper: Size): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= paper.w && r.y + r.h <= paper.h

// before の箱 id を next に変えたとき、押したあとの全部の四角（収まらなければ null）
export function pushFrom(
  before: ReadonlyMap<string, Rect>,
  id: string,
  next: Rect,
  paper: Size,
  gap = GAP,
): Map<string, Rect> | null {
  if (!inPaper(next, paper)) return null
  const now = new Map(before)
  now.set(id, next)
  const queue = [id]
  let steps = 0
  const limit = before.size * before.size * 4 + 16 // 押し合いが巡ってしまったときに止める
  while (queue.length > 0) {
    const m = queue.shift() as string
    const pusher = now.get(m) as Rect
    for (const [b, rect] of now) {
      if (b === m || !tooClose(pusher, rect, gap)) continue
      const was = { m: before.get(m) as Rect, b: before.get(b) as Rect }
      if (tooClose(was.m, was.b, gap)) continue
      if (b === id || ++steps > limit) return null
      const axis: Axis = apart(was.m, was.b, "x") >= apart(was.m, was.b, "y") ? "x" : "y"
      const len = LEN[axis]
      const ahead = was.b[axis] + was.b[len] / 2 >= was.m[axis] + was.m[len] / 2
      const at = ahead
        ? Math.max(rect[axis], pusher[axis] + pusher[len] + gap)
        : Math.min(rect[axis], pusher[axis] - gap - rect[len])
      const moved = { ...rect, [axis]: at }
      if (!inPaper(moved, paper)) return null
      now.set(b, moved)
      queue.push(b)
    }
  }
  return now
}

// before から after になって、新しく近づきすぎた組があるか（前から近づきすぎていた組は問わない）
export function newClash(before: ReadonlyMap<string, Rect>, after: ReadonlyMap<string, Rect>, gap = GAP): boolean {
  const ids = [...after.keys()]
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string
      const b = ids[j] as string
      const was = [before.get(a), before.get(b)]
      if (was[0] && was[1] && tooClose(was[0], was[1], gap)) continue
      if (tooClose(after.get(a) as Rect, after.get(b) as Rect, gap)) return true
    }
  }
  return false
}
