// レコードが指すほかのレコード: 対象の定義の refers が答える参照を、アクションが読んだレコード（reads）と読み口から引く。
// 読み口が無く、読んだレコードにも指す種類が無ければ引けない（"unreadable"）。引けないまま認可ステップに渡すと見逃すので、core は渡さずに断る
import type { CoreCatalog } from "./core-catalog"
import type { Referred } from "./def/permission"
import type { RecordSource } from "./record-source"
import { NO_RECORD, REMOVED, type Records } from "./records"

// レコード（none・removed なら参照は無い）が指す参照を、reads から引いたもの（引けないレコードは none）。
// reads に無い種類の参照は、読み口 source から引く
export function referredOf(
  catalog: CoreCatalog,
  subject: string,
  record: unknown,
  reads: Records,
  source?: RecordSource,
): readonly Referred[] | "unreadable" {
  if (record === NO_RECORD || record === REMOVED) return []
  const def = catalog.subjects.get(subject)
  const refs = def?.refers?.(record as never) ?? []
  const out: Referred[] = []
  for (const r of refs) {
    const table = reads[r.subject]
    if (table === undefined && !source) return "unreadable"
    out.push({ ...r, record: table?.[r.id] ?? source?.byId(r.subject, r.id) ?? NO_RECORD })
  }
  return out
}
