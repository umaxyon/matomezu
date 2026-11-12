// レコードが指すほかのレコード: 対象の定義の refers が答える参照を、アクションが読める種類（reads）から引く。
// 指す種類がアクションの reads に無ければ引けない（"unreadable"）。引けないまま認可ステップに渡すと見逃すので、core は渡さずに断る
import type { CoreCatalog } from "./core-catalog"
import type { Referred } from "./def/permission"
import type { RecordSource } from "./record-source"
import { NO_RECORD, REMOVED, type Records } from "./records"

// レコード（none・removed なら参照は無い）が指す参照を、reads から引いたもの（引けないレコードは none）。
// 読み口 source を渡せば（アクションの reads が種類の並びでないとき）、reads に無い種類の参照は読み口から引く
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

// アクションの reads の種類のレコード（種類の id → id → レコード）を、世界のレコードから選ぶ。performIn と permittedIn で同じ決まりを使う
export function readsOf(world: Records, reads: readonly string[] | undefined): Records {
  return Object.fromEntries((reads ?? []).map(k => [k, world[k] ?? {}]))
}

// 読む物を種類の並びで書いたアクションか（その種類のレコード全部を読む書き方。関数か、書いていなければ、指す先と同じ種類のほかのレコードは読み口から引く）
export function readsWholeKinds(reads: unknown): reads is readonly string[] {
  return Array.isArray(reads)
}
