// 紙に収める押し合い（OVERHAUL の「紙に収める」）: 箱の左上か大きさが変わったとき、近づきすぎた相手をどける。
// 試しに並べずに計算だけで、どけたあとの四角を出すか、収まらなければ null を返す純粋な関数。
// - 近づきすぎ: 横の離れと縦の離れが、どちらも間隔の下限（GAP）より小さい組（重なりも含む）
// - 押す: 変わった箱（元）は動かさず、近づきすぎた相手を、自分から遠ざける向きへだけ押す（押されて次の段へ回り込まない。引き寄せない）。
//   押された箱がまた近づきすぎた相手も同じ向きに押す（変わった箱から届く列だけをたどり、ほかの箱は見ない）。
//   押す向きは、元と相手の組なら呼ぶ側が決め（大きさを変えた・置いた・動かしたで違う）、押された箱と相手の組なら、変わる前の位置で離れていた方の向き
// - 押した先が紙からはみ出す・元を押し返すなら、収まらない（null）
// - 変わる前から近づきすぎていた組（よそから来たデータ）は押さない
//
// 動かしたとき（planMove）は、旧版のドラッグと同じく次の順に決める:
//   1. 箱 1 つを動かして、動いた向きの正面の相手に半分以上入ったなら、入れ替える（旧版と同じ。並べ替えのリストのように、
//      相手は動かした箱の大きさと間隔の分だけ動き始めた側へずれ、動かした箱はまだ相手と近ければ相手の向こう側へ寄せる。そこからまた押す）。
//      正面は、動いた向きを横切る向きで、小さい方の箱の半分以上重なっていること。半分は、相手の動いた向きの長さの半分
//   2. 入ってきた向き（重なりの浅い方の向き。動いた向き）に相手を押す
//   3. 押せなければ、動かした箱を相手の手前（入ってきた側）で止める
//   4. それも駄目なら、収まらない（動かさない）
// 置いたとき（planPlace）は、動きの向きが無いので、重なった相手を右へ押し、駄目なら下へ押す
import type { Point, Size } from "../../../../core/geom"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const GAP = 8 // 箱どうしの間隔の下限（線の無い箱）

export type Axis = "x" | "y"
const LEN = { x: "w", y: "h" } as const

// 元と相手の組を押す向き（ahead は、相手を axis の向きの先へ押すか）
export interface Way {
  axis: Axis
  ahead: boolean
}

type Rects = ReadonlyMap<string, Rect>

// a と b の axis の向きの離れ（重なっていれば負）
function apart(a: Rect, b: Rect, axis: Axis): number {
  const len = LEN[axis]
  return Math.max(b[axis] - (a[axis] + a[len]), a[axis] - (b[axis] + b[len]))
}

export const tooClose = (a: Rect, b: Rect, gap = GAP): boolean => apart(a, b, "x") < gap && apart(a, b, "y") < gap

const inPaper = (r: Rect, paper: Size): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= paper.w && r.y + r.h <= paper.h

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

const shifted = (r: Rect, by: Point): Rect => ({ ...r, x: r.x + by.x, y: r.y + by.y })

// 入ってきた向き: 重なり（間隔の下限を含む）の浅い方の向き
function entryAxis(moving: Rect, other: Rect, gap: number): Axis {
  return gap - apart(moving, other, "x") <= gap - apart(moving, other, "y") ? "x" : "y"
}

// 動いた向きに遠ざける（その向きに動いていなければ、真ん中の位置で決める）
function movingWay(by: Point, gap: number) {
  return (source: Rect, other: Rect): Way => {
    const axis = entryAxis(source, other, gap)
    return { axis, ahead: by[axis] !== 0 ? by[axis] > 0 : centerAhead(source, other, axis) }
  }
}

// 箱 1 つを dir の向き（axis の向きの先なら 1、手前なら -1）へ動かして、正面の相手に半分以上入ったか
function deepIn(moving: Rect, other: Rect, axis: Axis, dir: number): boolean {
  const cross = axis === "x" ? "y" : "x"
  const face = -apart(moving, other, cross) >= Math.min(moving[LEN[cross]], other[LEN[cross]]) / 2
  const len = LEN[axis]
  const depth = dir > 0 ? moving[axis] + moving[len] - other[axis] : other[axis] + other[len] - moving[axis]
  return face && depth >= other[len] / 2 && depth <= moving[len] + other[len]
}

const settled = (before: Rects, after: Map<string, Rect> | null, gap: number) =>
  after && !newClash(before, after, gap) ? after : null

// ids の箱を by だけ動かしたとき（ドラッグで離した・AI が動かした）の、全部の四角（収まらなければ null）。冒頭の 1〜4 の順に決める
export function planMove(
  before: Rects,
  ids: ReadonlySet<string>,
  by: Point,
  paper: Size,
  gap = GAP,
): Map<string, Rect> | null {
  const moved = new Map<string, Rect>()
  for (const id of ids) {
    const r = before.get(id)
    if (!r) return null
    moved.set(id, shifted(r, by))
  }
  // 1. 入れ替え
  const axis: Axis = Math.abs(by.x) >= Math.abs(by.y) ? "x" : "y"
  const dir = Math.sign(by[axis])
  if (moved.size === 1 && dir !== 0) {
    const [id, m] = [...moved][0] as [string, Rect]
    const len = LEN[axis]
    for (const [b, rect] of before) {
      if (b === id || !deepIn(m, rect, axis, dir)) continue
      const other = { ...rect, [axis]: rect[axis] - dir * (m[len] + gap) }
      const beyond = dir > 0 ? other[axis] + other[len] + gap : other[axis] - gap - m[len]
      const mine = tooClose(m, other, gap) ? { ...m, [axis]: beyond } : m
      const swapped = new Map([
        [id, mine],
        [b, other],
      ])
      const done = settled(before, push(before, swapped, paper, movingWay(by, gap), gap), gap)
      if (done) return done
      break
    }
  }
  // 2. 入ってきた向きに押す
  const pushed = settled(before, push(before, moved, paper, movingWay(by, gap), gap), gap)
  if (pushed) return pushed
  // 3. 相手の手前で止める: 近づきすぎた相手ごとに、入ってきた向きに戻す量を求め、向きごとに一番大きい量だけ戻す
  const back = { x: 0, y: 0 }
  for (const m of moved.values()) {
    for (const [b, rect] of before) {
      if (ids.has(b) || !tooClose(m, rect, gap)) continue
      const axis = entryAxis(m, rect, gap)
      if (by[axis] === 0) return null
      back[axis] = Math.max(back[axis], gap - apart(m, rect, axis))
    }
  }
  const stop = { x: by.x - Math.sign(by.x) * back.x, y: by.y - Math.sign(by.y) * back.y }
  if (Math.sign(stop.x) !== Math.sign(by.x) && stop.x !== 0) return null
  if (Math.sign(stop.y) !== Math.sign(by.y) && stop.y !== 0) return null
  const stopped = new Map(before)
  for (const id of ids) stopped.set(id, shifted(before.get(id) as Rect, stop))
  for (const id of ids) if (!inPaper(stopped.get(id) as Rect, paper)) return null
  // 4. 止めた所でも近づきすぎなら、収まらない
  return settled(before, stopped, gap)
}

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
