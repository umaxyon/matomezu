// ドラッグで箱を動かすときの並び（OVERHAUL の「紙に収める」）。試しに並べずに計算だけで決める純粋な関数。
// ドラッグは「動かした箱をどこへ置くか」だけを決め、ほかの箱は押さない（押すのは大きさが変わったときと置いたとき。push.ts）。
// - ドラッグ中: 動かす箱はポインタに付いて動き、ほかの箱と重なってもそのまま通す。
//   先端が正面から来た相手（came。このドラッグの通り道で覚える）に、相手の長さの半分まで入ったら、その場で入れ替える:
//   相手は動かす箱の大きさと間隔の分だけ、動き始めた側へずれる（並べ替えのリストで、通り過ぎた項目が空いた枠へずれるのと同じ）。
//   ずれた先が紙からはみ出す・ほかの箱と近すぎるなら、ずらさずに重ねて通す。
//   正面は、動いた向きを横切る向きで、小さい方の箱の半分以上重なっていること（角をかすめるだけでは入れ替えない）。
//   通り道を覚えるのは、相手の上を回り込んで反対側へ出たときに、通り抜けたのと同じに見えて入れ替わらないようにするため。
//   来た向きと逆へ動いて相手から抜けたら、覚えた向きを忘れる（引き返した）
// - 離したとき: 入れ替えた相手とまだ近ければ、動かした箱を相手の向こう側へ寄せる（入れ替えを仕上げる）。
//   入れ替えていない相手と近ければ、動かした箱を相手の手前（来た側）へ戻す（相手は動かさない）。
//   それでも紙からはみ出す・近すぎる組が残るなら、動かさない（元の位置に戻る）
// - 何個かまとめて動かすときは入れ替えず、近すぎる相手の手前へまとめて戻すだけ

import {
  type Axis,
  apart,
  evenGap,
  type Gap,
  inPaper,
  LEN,
  newClash,
  type Point,
  type Rect,
  type Size,
  tooClose,
} from "../../../plugin-api"

export type Dir = "left" | "right" | "up" | "down"
export const DIRS = ["left", "right", "up", "down"] as const
// 相手ごとの、先端が来た向き
export type Came = Readonly<Record<string, Dir>>

type Rects = ReadonlyMap<string, Rect>

const AXIS: Record<Dir, Axis> = { left: "x", right: "x", up: "y", down: "y" }
const SIGN: Record<Dir, number> = { left: -1, right: 1, up: -1, down: 1 }
const OPPOSITE: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" }
const CROSS: Record<Axis, Axis> = { x: "y", y: "x" }

const shifted = (r: Rect, by: Point): Rect => ({ ...r, x: r.x + by.x, y: r.y + by.y })

// 動いた向きを横切る向きで、小さい方の箱の半分以上重なっているか（正面）
function faceOn(m: Rect, o: Rect, axis: Axis): boolean {
  const c = CROSS[axis]
  return -apart(m, o, c) >= Math.min(m[LEN[c]], o[LEN[c]]) / 2
}

// d の向きに動く m の先端が、o にどれだけ入っているか
function depth(m: Rect, o: Rect, d: Dir): number {
  const a = AXIS[d]
  const len = LEN[a]
  return SIGN[d] > 0 ? m[a] + m[len] - o[a] : o[a] + o[len] - m[a]
}

// ドラッグを始めた位置から見て、o に近づいた向き（重なる位置から始めたなら null）
function fromStart(start: Rect, o: Rect): Dir | null {
  if (start.x >= o.x + o.w) return "left"
  if (start.x + start.w <= o.x) return "right"
  if (start.y >= o.y + o.h) return "up"
  if (start.y + start.h <= o.y) return "down"
  return null
}

// ドラッグの一歩（動いた量が prev から by になった）で、先端が正面から来た相手と、その向きを覚え直す
export function track(before: Rects, id: string, prev: Point, by: Point, came: Came): Came {
  const start = before.get(id)
  const dx = by.x - prev.x
  const dy = by.y - prev.y
  if (!start || (dx === 0 && dy === 0)) return came
  const travel: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up"
  const m = shifted(start, by)
  const next: Record<string, Dir> = { ...came }
  for (const [o, r] of before) {
    if (o === id) continue
    const was = next[o]
    if (was && travel === OPPOSITE[was] && depth(m, r, was) <= 0) delete next[o]
    else if (
      !was &&
      faceOn(m, r, AXIS[travel]) &&
      depth(m, r, travel) > 0 &&
      depth(m, r, travel) <= m[LEN[AXIS[travel]]]
    )
      next[o] = travel
  }
  return next
}

// ドラッグ中の並び: 動かす箱は start + by、入れ替えた相手はずらした所、ほかはそのまま
export function dragRects(
  before: Rects,
  id: string,
  by: Point,
  came: Came,
  paper: Size,
  gap: Gap = evenGap,
): Map<string, Rect> {
  const start = before.get(id)
  const now = new Map(before)
  if (!start) return now
  const m = shifted(start, by)
  now.set(id, m)
  for (const [o, d] of Object.entries(came)) {
    const r = before.get(o)
    const axis = AXIS[d]
    const len = LEN[axis]
    if (!r || !faceOn(m, r, axis) || depth(m, r, d) < r[len] / 2) continue
    const moved = { ...r, [axis]: r[axis] - SIGN[d] * (m[len] + gap(id, o)) }
    const blocked = [...now].some(([k, q]) => k !== o && k !== id && tooClose(moved, q, gap(o, k)))
    if (inPaper(moved, paper) && !blocked) now.set(o, moved)
  }
  return now
}

// 動かす箱 m を、d の向きに、hits の相手の向こう側（beyond）か手前へ寄せた四角（相手ごとに、その組の間隔 gap を空ける）
function beside(m: Rect, hits: readonly { r: Rect; gap: number }[], d: Dir, beyond: boolean): Rect {
  const axis = AXIS[d]
  const len = LEN[axis]
  const far = SIGN[d] > 0 === beyond
  const at = far
    ? Math.max(...hits.map(({ r: o, gap }) => o[axis] + o[len] + gap))
    : Math.min(...hits.map(({ r: o, gap }) => o[axis] - gap - m[len]))
  return { ...m, [axis]: at }
}

// 離したときの並び（収まらなければ null）。came が無いとき（AI が動かした）は、始めの位置から見た向きで決める
export function dropRects(
  before: Rects,
  id: string,
  by: Point,
  came: Came | undefined,
  paper: Size,
  gap: Gap = evenGap,
): Map<string, Rect> | null {
  const start = before.get(id)
  if (!start) return null
  const at = shifted(start, by)
  const seen: Came =
    came ??
    Object.fromEntries(
      [...before].flatMap(([o, r]) => {
        const d = o !== id && fromStart(start, r)
        return d && faceOn(at, r, AXIS[d]) ? [[o, d]] : []
      }),
    )
  const now = dragRects(before, id, by, seen, paper, gap)
  let m = now.get(id) as Rect
  // 入れ替えた相手とまだ近ければ、向こう側へ寄せる
  const swapped = [...now].filter(([o, r]) => o !== id && r !== before.get(o)).map(([o]) => o)
  const near = swapped.filter(o => tooClose(m, now.get(o) as Rect, gap(id, o)))
  const d0 = near[0] && seen[near[0]]
  if (d0) {
    const hits = near.filter(o => seen[o] === d0).map(o => ({ r: now.get(o) as Rect, gap: gap(id, o) }))
    m = beside(m, hits, d0, true)
  }
  // 入れ替えていない相手と近ければ、手前へ戻す
  const ahead = [...now]
    .filter(([o, r]) => o !== id && !swapped.includes(o) && tooClose(m, r, gap(id, o)))
    .map(([o, r]) => ({ r, gap: gap(id, o), d: seen[o] ?? fromStart(start, r) }))
    .filter((a): a is { r: Rect; gap: number; d: Dir } => a.d !== null)
  const d1 = ahead[0]?.d
  if (d1)
    m = beside(
      m,
      ahead.filter(a => a.d === d1),
      d1,
      false,
    )
  now.set(id, m)
  return inPaper(m, paper) && !newClash(before, now, gap) ? now : null
}

// 何個かまとめて動かしたときの並び（入れ替えない。近すぎる相手があれば、まとめて来た側へ戻す。収まらなければ null）
export function dropManyRects(
  before: Rects,
  ids: ReadonlySet<string>,
  by: Point,
  paper: Size,
  gap: Gap = evenGap,
): Map<string, Rect> | null {
  const back = { x: 0, y: 0 }
  for (const id of ids) {
    const start = before.get(id)
    if (!start) return null
    const m = shifted(start, by)
    for (const [o, r] of before) {
      const g = gap(id, o)
      if (ids.has(o) || !tooClose(m, r, g)) continue
      const d = fromStart(start, r)
      if (!d) continue
      const axis = AXIS[d]
      back[axis] = Math.max(back[axis], depth(m, r, d) + g)
    }
  }
  const to = { x: by.x - Math.sign(by.x) * back.x, y: by.y - Math.sign(by.y) * back.y }
  const now = new Map(before)
  for (const id of ids) {
    const r = shifted(before.get(id) as Rect, to)
    if (!inPaper(r, paper)) return null
    now.set(id, r)
  }
  return newClash(before, now, gap) ? null : now
}
