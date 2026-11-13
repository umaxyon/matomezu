// 索引キー: 対象の定義（core/def/subject.ts の keys）が宣言する、レコードを探すのに使う値。レコードから値を返す関数で宣言し、保存は中身とは別に持つ（中身を開けずに探す）。
// 条件に合うか・並びは、ここの関数 1 つずつで決める（画面とホストのエンジンが同じ関数を使う。保存の索引は候補を絞るだけ）。
// 並びは、キーの値の小さい順か大きい順で、同じ値と値の無いレコードは id の順（値の無いレコードは、どちらの向きでも後ろ）
import type { SubjectId, SubjectTable } from "./catalog"
import type { SubjectDef } from "./def/subject"

export type KeyValue = string | number

// 索引キーの値の組（キーの名前 → 値。値の無いキーは持たない）
export type KeyValues = Readonly<Record<string, KeyValue>>

// 条件 1 つ（索引キーにだけ書ける）: 同じ・より小さい・より大きい・値が無い（absent）・値がある（present）
export type Condition<K extends string = string> =
  | { key: K; eq: KeyValue }
  | { key: K; lt: KeyValue }
  | { key: K; gt: KeyValue }
  | { key: K; is: "absent" | "present" }

export interface Order<K extends string = string> {
  key: K
  dir: "asc" | "desc"
}

// 種類 S が宣言した索引キーの名前と値の型（対象の定義の keys から決まる。条件・並び・ctx.keys・useRecords の型に使う）
type KeysDeclOf<S extends SubjectId> = SubjectTable[S] extends { keys?: infer K } ? NonNullable<K> : never
export type KeyNameOf<S extends SubjectId> = keyof KeysDeclOf<S> & string
type KeyValueOf<S extends SubjectId, N extends KeyNameOf<S>> = KeysDeclOf<S>[N] extends { type: "number" }
  ? number
  : string
// 種類 S のレコード 1 件の索引キーの値の組（値の無いキーは持たない）
export type KeyValuesOf<S extends SubjectId> = { readonly [N in KeyNameOf<S>]?: KeyValueOf<S, N> }
// 種類 S の条件 1 つ（宣言した名前と、その値の型だけを書ける）
export type ConditionOf<S extends SubjectId> = {
  [N in KeyNameOf<S>]:
    | { key: N; eq: KeyValueOf<S, N> }
    | { key: N; lt: KeyValueOf<S, N> }
    | { key: N; gt: KeyValueOf<S, N> }
    | { key: N; is: "absent" | "present" }
}[KeyNameOf<S>]
export type OrderOf<S extends SubjectId> = Order<KeyNameOf<S>>

// レコード 1 件の索引キーの値（宣言した型と違う値と、値を返さないキーは持たない。レコードが形に合わず関数が投げたキーも持たない）
export function keyValuesOf(def: Pick<SubjectDef, "keys">, record: unknown): KeyValues {
  const out: Record<string, KeyValue> = {}
  for (const [name, key] of Object.entries(def.keys ?? {})) {
    let value: unknown
    try {
      value = key.of(record as never)
    } catch {
      continue
    }
    if (key.type === "text" ? typeof value === "string" : typeof value === "number" && Number.isFinite(value))
      out[name] = value as KeyValue
  }
  return out
}

// 値どうしの大小（数は数の順、字は符号位置の順。型が違えば数が先）
function compareValues(a: KeyValue, b: KeyValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0
  return typeof a === "number" ? -1 : 1
}

// 索引キーの値の組 values が、条件 where の全部に合うか
export function matches(values: KeyValues, where: readonly Condition[]): boolean {
  return where.every(c => {
    const v = values[c.key]
    if ("is" in c) return c.is === "absent" ? v === undefined : v !== undefined
    if (v === undefined) return false
    if ("eq" in c) return v === c.eq
    if ("lt" in c) return typeof v === typeof c.lt && compareValues(v, c.lt) < 0
    return typeof v === typeof c.gt && compareValues(v, c.gt) > 0
  })
}

// id と索引キーの値を持つ行を、order の順に並べる（order が無ければ id の順）
export function inOrder<T extends { id: string; keys: KeyValues }>(rows: readonly T[], order?: Order): T[] {
  const byId = (a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  if (!order) return [...rows].sort(byId)
  const sign = order.dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = a.keys[order.key]
    const y = b.keys[order.key]
    if (x === undefined || y === undefined) return x === y ? byId(a, b) : x === undefined ? 1 : -1
    return sign * compareValues(x, y) || byId(a, b)
  })
}

// 条件とキーの名前が、種類の宣言した索引キーにあり、値の型も合っているか（合わない所があれば、そのキーの名前）
export function unknownKey(def: Pick<SubjectDef, "keys">, where: readonly Condition[], order?: Order): string | null {
  const keys = def.keys ?? {}
  for (const c of where) {
    const key = keys[c.key]
    if (!key) return c.key
    const value = "eq" in c ? c.eq : "lt" in c ? c.lt : "gt" in c ? c.gt : undefined
    if (value !== undefined && (key.type === "text") !== (typeof value === "string")) return c.key
  }
  return order && !keys[order.key] ? order.key : null
}
