// 紙に収める押し合い（OVERHAUL の「紙に収める」）: 箱の左上か大きさが変わったとき、近づきすぎた相手をどける。
// 試しに並べずに計算だけで、どけたあとの四角を出すか、収まらなければ null を返す純粋な関数。
// - 近づきすぎ: 横の離れと縦の離れが、どちらも間隔の下限（GAP）より小さい組（重なりも含む）
// - 押す: 変わった箱（元）は動かさず、近づきすぎた相手を、自分から遠ざける向きへだけ押す（押されて次の段へ回り込まない。引き寄せない）。
//   押された箱がまた近づきすぎた相手も同じ向きに押す（変わった箱から届く列だけをたどり、ほかの箱は見ない）。
//   押す向きは、元と相手の組なら呼ぶ側が決め（大きさを変えた・置いたで違う）、押された箱と相手の組なら、変わる前の位置で離れていた方の向き
// - 押した先が紙からはみ出す・元を押し返すなら、収まらない（null）
// - 変わる前から近づきすぎていた組（よそから来たデータ）は押さない
// - 押した列が紙からはみ出すときは、その列の押された箱を、縮めてよい下限まで余裕に比例して縮めて収める（pushShrinking。呼ぶ側が使うか決める）
// 置いたとき（planPlace）は、動きの向きが無いので、重なった相手を右へ押し、駄目なら下へ押す。動かしたとき（ドラッグ）の決まりは drag.ts
import type { Size } from "../../../../core/geom"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const GAP = 8 // 箱どうしの間隔の下限（線の無い箱）

// 2 つの箱 a・b の間隔の下限（組ごとに決まる。線でつながった組は広い）
export type Gap = (a: string, b: string) => number
export const evenGap: Gap = () => GAP

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

export const tooClose = (a: Rect, b: Rect, gap: number): boolean => apart(a, b, "x") < gap && apart(a, b, "y") < gap

export const inPaper = (r: Rect, paper: Size): boolean =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= paper.w && r.y + r.h <= paper.h

const centerAhead = (from: Rect, to: Rect, axis: Axis): boolean =>
  to[axis] + to[LEN[axis]] / 2 >= from[axis] + from[LEN[axis]] / 2

// 変わる前の位置で離れていた方の向きに、遠ざける向きへ
function apartWay(was: Rect, wasOther: Rect): Way {
  const axis: Axis = apart(was, wasOther, "x") >= apart(was, wasOther, "y") ? "x" : "y"
  return { axis, ahead: centerAhead(was, wasOther, axis) }
}

// 押した結果: 全部の四角と、押された箱ごとの押した箱
interface Spread {
  now: Map<string, Rect>
  from: Map<string, string>
}

// sources の箱を、その四角に変えたとき（sources は動かさない）に押していった結果。紙は見ない。元を押し返す・押し合いが巡るなら null
function spread(
  before: Rects,
  sources: Rects,
  way: ((source: Rect, other: Rect) => Way) | undefined,
  gap: Gap,
): Spread | null {
  const now = new Map(before)
  for (const [id, r] of sources) now.set(id, r)
  const from = new Map<string, string>()
  const queue = [...sources.keys()]
  let steps = 0
  const limit = now.size * now.size * 4 + 16 // 押し合いが巡ってしまったときに止める
  while (queue.length > 0) {
    const m = queue.shift() as string
    const pusher = now.get(m) as Rect
    const wasM = before.get(m)
    for (const [b, rect] of now) {
      const g = gap(m, b)
      if (b === m || !tooClose(pusher, rect, g)) continue
      const wasB = before.get(b)
      if (wasM && wasB && tooClose(wasM, wasB, g)) continue
      if (sources.has(b) || ++steps > limit) return null
      const w = sources.has(m) && way ? way(pusher, rect) : apartWay(wasM ?? pusher, wasB ?? rect)
      const len = LEN[w.axis]
      const at = w.ahead
        ? Math.max(rect[w.axis], pusher[w.axis] + pusher[len] + g)
        : Math.min(rect[w.axis], pusher[w.axis] - g - rect[len])
      now.set(b, { ...rect, [w.axis]: at })
      from.set(b, m)
      queue.push(b)
    }
  }
  return { now, from }
}

// sources の箱を、その四角に変えたとき（sources は動かさない）の、押したあとの全部の四角。
// way は元と相手の組を押す向き（無ければ、変わる前の位置で離れていた方）
export function push(
  before: Rects,
  sources: Rects,
  paper: Size,
  way?: (source: Rect, other: Rect) => Way,
  gap: Gap = evenGap,
): Map<string, Rect> | null {
  const done = spread(before, sources, way, gap)
  return done && [...done.now.values()].every(r => inPaper(r, paper)) ? done.now : null
}

// 縮めてよい下限（縮められない箱は今の大きさ）
export type Floors = ReadonlyMap<string, { w: number; h: number }>

// 紙からはみ出した量（向きごとの、端を越えた一番大きい量）
function overflow(r: Rect, paper: Size, axis: Axis): number {
  const len = LEN[axis]
  return Math.max(r[axis] + r[len] - paper[len], -r[axis], 0)
}

// push と同じに押し、押した列が紙からはみ出すなら、その列の押された箱を縮めて収める（OVERHAUL の「紙に収める」）。
// 縮めるのは、はみ出した箱から元へさかのぼる列の、押された箱だけ（元は縮めない）。足りない量を、箱ごとの余裕（今の大きさ − 下限 floors）に比例して分ける
// （HTML の表・flexbox と同じ。余裕に比例するので、全員が同時に下限に着く）。余裕が足りなければ収まらない（null）
export function pushShrinking(
  before: Rects,
  sources: Rects,
  paper: Size,
  floors: Floors,
  way?: (source: Rect, other: Rect) => Way,
  gap: Gap = evenGap,
): Map<string, Rect> | null {
  for (const r of sources.values()) if (!inPaper(r, paper)) return null
  let sized = new Map(before)
  for (let round = 0; round < 8; round++) {
    const done = spread(sized, sources, way, gap)
    if (!done) return null
    let fits = true
    let cut = false
    const next = new Map(sized)
    for (const axis of ["x", "y"] as const) {
      const out = [...done.now].filter(([, r]) => overflow(r, paper, axis) > 0)
      if (out.length === 0) continue
      fits = false
      const short = Math.max(...out.map(([, r]) => overflow(r, paper, axis)))
      // はみ出した箱から元へさかのぼる列（押された箱だけ）
      const chain = new Set<string>()
      for (const [id] of out)
        for (let k: string | undefined = id; k && !sources.has(k); k = done.from.get(k)) chain.add(k)
      const len = LEN[axis]
      const room = [...chain].map(id => ({ id, r: next.get(id) as Rect, room: 0 }))
      for (const c of room) c.room = Math.max(0, c.r[len] - (floors.get(c.id)?.[len] ?? c.r[len]))
      const total = room.reduce((n, c) => n + c.room, 0)
      if (total < short) return null
      for (const c of room) {
        const take = Math.ceil((short * c.room) / total)
        if (take <= 0) continue
        next.set(c.id, { ...c.r, [len]: Math.max(c.r[len] - take, floors.get(c.id)?.[len] ?? c.r[len]) })
        cut = true
      }
    }
    if (fits) return done.now
    if (!cut) return null
    sized = next
  }
  return null
}

// 箱 id の左上か大きさを next に変えたとき（大きさを変えた・キャプションで広がった）。相手は変わる前の位置で離れていた方の向きに押す。
// floors を渡せば、押した列が紙からはみ出すときに縮めて収める（pushShrinking）
export function pushFrom(
  before: Rects,
  id: string,
  next: Rect,
  paper: Size,
  floors?: Floors,
  gap: Gap = evenGap,
): Map<string, Rect> | null {
  const sources = new Map([[id, next]])
  return floors
    ? pushShrinking(before, sources, paper, floors, undefined, gap)
    : push(before, sources, paper, undefined, gap)
}

// before から after になって、新しく近づきすぎた組があるか（前から近づきすぎていた組は問わない）
export function newClash(before: Rects, after: Rects, gap: Gap = evenGap): boolean {
  const ids = [...after.keys()]
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string
      const b = ids[j] as string
      const was = [before.get(a), before.get(b)]
      const g = gap(a, b)
      if (was[0] && was[1] && tooClose(was[0], was[1], g)) continue
      if (tooClose(after.get(a) as Rect, after.get(b) as Rect, g)) return true
    }
  }
  return false
}

const settled = (before: Rects, after: Map<string, Rect> | null, gap: Gap) =>
  after && !newClash(before, after, gap) ? after : null

// 箱 id を rect に置いたとき（置いた・貼った）の、全部の四角（収まらなければ null）。
// 重なった相手を右へ押し、駄目なら下へ押す。どちらも駄目なら、押した列を縮めて右へ、それも駄目なら縮めて下へ（floors が縮めてよい下限）
export function planPlace(
  before: Rects,
  id: string,
  rect: Rect,
  paper: Size,
  floors: Floors = new Map(),
  gap: Gap = evenGap,
): Map<string, Rect> | null {
  const sources = new Map([[id, rect]])
  const ways = (["x", "y"] as const).map(axis => () => ({ axis, ahead: true }))
  for (const way of ways) {
    const done = settled(before, push(before, sources, paper, way, gap), gap)
    if (done) return done
  }
  for (const way of ways) {
    const done = settled(before, pushShrinking(before, sources, paper, floors, way, gap), gap)
    if (done) return done
  }
  return null
}
