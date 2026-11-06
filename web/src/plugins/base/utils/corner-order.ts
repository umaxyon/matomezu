// 物の右上の角に出すコーナーステータス（corner.tsx）の並べ方と、コーナーステータスの並びの利用者の設定の項目。
// 物ごとに分け、コーナーステータスの並びで先の物が先、同じコーナーステータスなら at（ISO 8601 の時点）の新しい物が先、同じなら後に登録した物が先。
// 並びは、利用者の設定の並び（今のインスタンスに無い物は飛ばす）のあとに、そこに無い物を既定の並び（スロット corner-statuses の並び）で足した物
import { z } from "zod"
import { kit } from "../kit"

// コーナーステータスの並び（id の並び。既定は空で、スロット corner-statuses の並びのまま）。今のインスタンスに無い id も残す（プラグインを戻せばまた効く）
export const CORNER_STATUS_ORDER = kit.defineSetting({
  id: "corner-status-order",
  title: "Corner status order",
  schema: z.array(z.string()),
  default: [],
})

// 角に出す物の登録（V は縁の印の型。並べ方は印を見ない）
export interface CornerEntry<V = unknown> {
  anchor: string // 角に出す物の id
  status: string // コーナーステータス（スロット corner-statuses に置くウィジェットの id）
  at: string // 同じコーナーステータスの中の順（新しい方が先）
  pointer: V | null // 物が見える所の外にある間に縁に出す印（StandPointer など。無ければ null）
  seq: number // 登録した順
}

// 並べた角に出す物（id と登録）
export interface PlacedCorner<V = unknown> {
  id: string
  entry: CornerEntry<V>
}

// コーナーステータスの並び: 利用者の設定の並び chosen のうち placed にある物、そのあとに chosen に無い placed の物（placed の順）
export function statusOrder(chosen: readonly string[], placed: readonly string[]): readonly string[] {
  const shown = chosen.filter((s, i) => placed.includes(s) && chosen.indexOf(s) === i)
  return [...shown, ...placed.filter(s => !shown.includes(s))]
}

// コーナーステータス status を並びの中で by（-1 で前、1 で後ろ）へ 1 つ動かした、利用者の設定の値（chosen にあって placed に無い物は、後ろに残す）。端なら動かさない
export function movedStatus(
  chosen: readonly string[],
  placed: readonly string[],
  status: string,
  by: -1 | 1,
): readonly string[] {
  const order = [...statusOrder(chosen, placed)]
  const i = order.indexOf(status)
  const j = i + by
  if (i < 0 || j < 0 || j >= order.length) return chosen
  ;[order[i], order[j]] = [order[j] as string, order[i] as string]
  return [...order, ...chosen.filter(s => !placed.includes(s))]
}

// 角に出す物 entries を、物ごとに、コーナーステータスの並び statuses（statusOrder）で並べた表（物の順は、物が最初に登録された順。並びに無い物は後ろ）
export function cornersByAnchor<V>(
  entries: ReadonlyMap<string, CornerEntry<V>>,
  statuses: readonly string[],
): ReadonlyMap<string, readonly PlacedCorner<V>[]> {
  const groups = new Map<string, PlacedCorner<V>[]>()
  for (const [id, entry] of [...entries].sort(([, a], [, b]) => a.seq - b.seq)) {
    const group = groups.get(entry.anchor) ?? []
    group.push({ id, entry })
    groups.set(entry.anchor, group)
  }
  const rank = (status: string) => {
    const i = statuses.indexOf(status)
    return i < 0 ? statuses.length : i
  }
  const first = (a: PlacedCorner<V>, b: PlacedCorner<V>) =>
    rank(a.entry.status) !== rank(b.entry.status)
      ? rank(a.entry.status) - rank(b.entry.status)
      : a.entry.at !== b.entry.at
        ? a.entry.at < b.entry.at
          ? 1
          : -1
        : b.entry.seq - a.entry.seq
  return new Map([...groups].map(([anchor, group]) => [anchor, group.sort(first)]))
}
