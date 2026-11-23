// プラグインの見た目が使う、レコードのフック（matomezu/ui）: 対象の定義の種類のレコードを、索引キーの条件と並びで読む

import { useMemo } from "react"
import type { SubjectId } from "../core/catalog"
import type { RecordOf } from "../core/def/action"
import { type Condition, type ConditionOf, inOrder, type Order, type OrderOf, unknownKey } from "../core/record-keys"
import { find, sourceOf } from "../core/record-source"
import { NO_RECORD } from "../core/records"
import { useMatomezuState } from "./store-context"
import { useCoreCatalog } from "./view-hooks"

// useRecords の読み方: 索引キーの条件（全部を読むなら空）・並び（無ければ id の順）・件数（無ければ合う全部）。
// 合うか・並びは、アクションの reads とホストの読みと同じ関数（core/record-keys.ts）で決める
// 条件と並びに書けるのは、種類 T が宣言した索引キーの名前と、その値の型だけ
export interface RecordsQuery<T extends SubjectId> {
  where: readonly ConditionOf<T>[]
  order?: OrderOf<T>
  limit?: number
}

// 対象の定義の種類 subject のレコードのうち、query に合う物。定義の record に合わない物（warning W025 の物）は返さない。
// 宣言に無い索引キーを条件か並びに書けば、何も返さない。返す配列は、その種類のレコードと query が変わらない間は同じ参照
export function useRecords<const T extends SubjectId>(subject: T, query: RecordsQuery<T>): readonly RecordOf<T>[] {
  const catalog = useCoreCatalog()
  const table = useMatomezuState(s => s.records[subject])
  const asked = JSON.stringify(query)
  return useMemo(() => {
    const { where, order, limit } = JSON.parse(asked) as { where: readonly Condition[]; order?: Order; limit?: number }
    const def = catalog.subjects.get(subject)
    // 並びのキーは find が見ないので、ここで確かめる（宣言に無ければ何も返さない）
    if (!def || unknownKey(def, [], order) !== null) return []
    const rows = Object.entries(find(catalog, sourceOf({ [subject]: table ?? {} }), subject, where))
      .filter(([, r]) => def.record.safeParse(r.record).success)
      .map(([id, r]) => ({ id, keys: r.keys, record: r.record }))
    return inOrder(rows, order)
      .slice(0, limit)
      .map(r => r.record) as RecordOf<T>[]
  }, [catalog, subject, table, asked])
}

// 種類 subject の id のレコード 1 件（無いか、定義の record に合わなければ NO_RECORD）
export function useRecord<const T extends SubjectId>(subject: T, id: string): RecordOf<T> | typeof NO_RECORD {
  const catalog = useCoreCatalog()
  const one = useMatomezuState(s => s.records[subject]?.[id])
  return useMemo(() => {
    const record = catalog.subjects.get(subject)?.record
    return one !== undefined && record?.safeParse(one).success ? (one as RecordOf<T>) : NO_RECORD
  }, [catalog, subject, one])
}
