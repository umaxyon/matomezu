// 物の自分の値: 変更提案郵便が、送った時と反映する時の当たる物を比べるのに使う
import { objectsById } from "../../../core/ids"
import { sameData } from "../../../core/same"

// 値の中の、id を持つ物ごとの、自分の値（id → 値。中の id を持つ物は、その id だけにした値。中の物が変わっても自分の値は変わらず、
// 中の物を足した・外した・並べ替えたなら変わる）
export function ownValues(value: unknown): Map<string, unknown> {
  const all = new Map<string, unknown>()
  for (const [id, obj] of objectsById(value)) all.set(id, ownOf(obj, true))
  return all
}

function ownOf(value: unknown, top: boolean): unknown {
  if (Array.isArray(value)) return value.map(v => ownOf(v, false))
  if (typeof value !== "object" || value === null) return value
  const { id } = value as { id?: unknown }
  if (!top && typeof id === "string") return { id }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ownOf(v, false)]))
}

// 値 before にある、id を持つ物のうち、after で自分の値（ownValues）が変わったか無くなった物の id
export function ownChanged(before: unknown, after: unknown): string[] {
  const now = ownValues(after)
  return [...ownValues(before)].filter(([id, v]) => !now.has(id) || !sameData(v, now.get(id))).map(([id]) => id)
}
