// レコードが指すほかのレコード: 対象の定義の refers が答える参照を、アクションが読める種類（reads）から引く。
// 指す種類がアクションの reads に無ければ引けない（"unreadable"）。引けないまま認可ステップに渡すと見逃すので、core は渡さずに断る
import type { CoreCatalog } from "./core-catalog"
import type { Referred } from "./def/permission"
import { NO_RECORD, REMOVED, type Records } from "./records"

// レコード（none・removed なら参照は無い）が指す参照を、reads から引いたもの（引けないレコードは none）
export function referredOf(
  catalog: CoreCatalog,
  subject: string,
  record: unknown,
  reads: Records,
): readonly Referred[] | "unreadable" {
  if (record === NO_RECORD || record === REMOVED) return []
  const def = catalog.subjects.get(subject)
  const refs = def?.refers?.(record as never) ?? []
  const out: Referred[] = []
  for (const r of refs) {
    const table = reads[r.subject]
    if (table === undefined) return "unreadable"
    out.push({ ...r, record: table[r.id] ?? NO_RECORD })
  }
  return out
}

// アクションの reads の種類のレコード（種類の id → id → レコード）を、世界のレコードから選ぶ。performIn と permittedIn で同じ決まりを使う
export function readsOf(world: Records, reads: readonly string[] | undefined): Records {
  return Object.fromEntries((reads ?? []).map(k => [k, world[k] ?? {}]))
}
