// 紙に収める押し合い（OVERHAUL の「紙に収める」）: 箱の左上か大きさが変わったとき、近づきすぎた相手をどける。
// 試しに並べずに計算だけで、どけたあとの四角を出すか、収まらなければ null を返す純粋な関数。
// - 近づきすぎ: 横の離れと縦の離れが、どちらも間隔の下限（GAP）より小さい組（重なりも含む）
// - 押す: 変わった箱（元）は動かさず、近づきすぎた相手を、自分から遠ざける向きへだけ押す（押されて次の段へ回り込まない。引き寄せない）。
//   押された箱がまた近づきすぎた相手も同じ向きに押す（変わった箱から届く列だけをたどり、ほかの箱は見ない）。
//   押す向きは、元と相手の組なら呼ぶ側が決め（大きさを変えた・置いたで違う）、押された箱と相手の組なら、変わる前の位置で離れていた方の向き
// - 押した先が紙からはみ出す・元を押し返すなら、収まらない（null）
// - 変わる前から近づきすぎていた組（よそから来たデータ）は押さない
// 置いたとき（planPlace）は、動きの向きが無いので、重なった相手を右へ押し、駄目なら下へ押す。動かしたとき（ドラッグ）の決まりは drag.ts
import type { Size } from "../../../../core/geom"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const GAP = 8 // 箱どうしの間隔の下限（線の無い箱）

export type Axis = "x" | "y"
export const LEN = { x: "w", y: "h" } as const

// 元と相手の組を押す向き（ahead は、相手を axis の向きの先へ押すか）
export interface Way {
  axis: Axis
  ahead: boolean
}

type Rects = ReadonlyMap<string, Rect>

// a と b の axis の向きの離れ（重なっていれば負）
export function apart(a: Rect, b: Rect, axis: Axis): number {
  const len = LEN[axis]
  return Math.max(b[axis] - (a[axis] + a[len]), a[axis] - (b[axis] + b[len]))
}

export const tooClose = (a: Rect, b: Rect, gap = GAP): boolean => apart(a, b, "x") < gap && apart(a, b, "y") < gap

export const inPaper = (r: Rect, paper: Size): boolean =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= paper.w && r.y + r.h <= paper.h

const centerAhead = (from: Rect, to: Rect, axis: Axis): boolean =>
  to[axis] + to[LEN[axis]] / 2 >= from[axis] + from[LEN[axis]] / 2

// 変わる前の位置で離れていた方の向きに、遠ざける向きへ
function apartWay(was: Rect, wasOther: Rect): Way {
  const axis: Axis = apart(was, wasOther, "x") >= apart(was, wasOther, "y") ? "x" : "y"
  return { axis, ahead: centerAhead(was, wasOther, axis) }
}

// sources の箱を、その四角に変えたとき（sources は動かさない）の、押したあとの全部の四角。
// way は元と相手の組を押す向き（無ければ、変わる前の位置で離れていた方）
export function push(
  before: Rects,
  sources: Rects,
  paper: Size,
  way?: (source: Rect, other: Rect) => Way,
  gap = GAP,
): Map<string, Rect> | null {
  for (const r of sources.values()) if (!inPaper(r, paper)) return null
  const now = new Map(before)
  for (const [id, r] of sources) now.set(id, r)
  const queue = [...sources.keys()]
  let steps = 0
  const limit = now.size * now.size * 4 + 16 // 押し合いが巡ってしまったときに止める
  while (queue.length > 0) {
    const m = queue.shift() as string
    const pusher = now.get(m) as Rect
    const wasM = before.get(m)
    for (const [b, rect] of now) {
      if (b === m || !tooClose(pusher, rect, gap)) continue
      const wasB = before.get(b)
      if (wasM && wasB && tooClose(wasM, wasB, gap)) continue
      if (sources.has(b) || ++steps > limit) return null
      const w = sources.has(m) && way ? way(pusher, rect) : apartWay(wasM ?? pusher, wasB ?? rect)
      const len = LEN[w.axis]
      const at = w.ahead
        ? Math.max(rect[w.axis], pusher[w.axis] + pusher[len] + gap)
        : Math.min(rect[w.axis], pusher[w.axis] - gap - rect[len])
      const moved = { ...rect, [w.axis]: at }
      if (!inPaper(moved, paper)) return null
      now.set(b, moved)
      queue.push(b)
    }
  }
  return now
}

// 箱 id の左上か大きさを next に変えたとき（大きさを変えた・キャプションで広がった）。相手は変わる前の位置で離れていた方の向きに押す
export function pushFrom(before: Rects, id: string, next: Rect, paper: Size, gap = GAP): Map<string, Rect> | null {
  return push(before, new Map([[id, next]]), paper, undefined, gap)
}

// before から after になって、新しく近づきすぎた組があるか（前から近づきすぎていた組は問わない）
export function newClash(before: Rects, after: Rects, gap = GAP): boolean {
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

const settled = (before: Rects, after: Map<string, Rect> | null, gap: number) =>
  after && !newClash(before, after, gap) ? after : null

// 箱 id を rect に置いたとき（置いた・貼った）の、全部の四角（収まらなければ null）。重なった相手を右へ押し、駄目なら下へ押す
export function planPlace(before: Rects, id: string, rect: Rect, paper: Size, gap = GAP): Map<string, Rect> | null {
  const sources = new Map([[id, rect]])
  for (const axis of ["x", "y"] as const) {
    const done = settled(
      before,
      push(before, sources, paper, () => ({ axis, ahead: true }), gap),
      gap,
    )
    if (done) return done
  }
  return null
}
