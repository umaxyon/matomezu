import type { CoreCatalog } from "./core-catalog"
import { checkMail } from "./mail"
import { splitId } from "./names"
import { type Warning, warning } from "./warnings"

// レコード: 対象の定義（core/def/subject.ts）が足した種類のデータ。種類ごとに id → レコード 1 件（中は種類の形。core は読まない）。
// アクション 1 回は 1 つのトランザクションで、宛先の 1 件（新しく作る〈on の record が無い。受け取るのは none〉か、直すか、消す〈返すのは removed〉）のほかに、
// 同じ種類のレコードをいくつも変えられる（RECORDS_MAX 件まで。全部が通るか、全部を断る）
export type Records = Readonly<Record<string, Readonly<Record<string, unknown>>>>

// アクションが変えたレコード 1 件（record は新しいレコードか、消したなら removed）
export interface RecordChange {
  subject: string
  id: string
  record: unknown
}

// 番号を振る種類ごとの、区切り → 次の番号（種類の id → 区切り → 次の番号。使い回さないので、レコードを消しても戻さない）。
// アクションの結果では、そのアクションが進めた区切りだけを持つ（レコードを書くのと同じ 1 回の書き込みで進める）
export type Counters = Readonly<Record<string, Readonly<Record<string, number>>>>

export const NO_RECORD = "none"
export const REMOVED = "removed"

// アクション 1 回が変えられるレコードの、いちばん多い数（宛先の 1 件も数える）
export const RECORDS_MAX = 250

// レコードを指す宛先
export type OnRecord = { record: string }

// 残しておいた番号の表（外から来る値。種類 → 区切り → 次の番号の形でなければ空）
export function restoreCounters(saved: unknown): Counters {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {}
  return Object.fromEntries(
    Object.entries(saved).filter(
      (e): e is [string, Record<string, number>] => typeof e[1] === "object" && e[1] !== null,
    ),
  )
}

// 残しておいたレコード（外から来る値。種類ごとの id → レコードの形でなければ空とし、中の 1 件ずつは確かめずに持つ）
export function restoreRecords(saved: unknown): Records {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {}
  return Object.fromEntries(
    Object.entries(saved).filter(
      (e): e is [string, Record<string, unknown>] => typeof e[1] === "object" && e[1] !== null && !Array.isArray(e[1]),
    ),
  )
}

// 進めた番号 advanced（種類 → 区切り → 次の番号）を当てた、新しい番号の表
export function withCounters(counters: Counters, advanced: Counters | undefined): Counters {
  if (advanced === undefined) return counters
  let next = counters
  for (const [subject, scopes] of Object.entries(advanced))
    next = { ...next, [subject]: { ...(next[subject] ?? {}), ...scopes } }
  return next
}

// レコードの変更 changes を順に当てた、新しいレコード（消したなら、その種類の中から外す。種類のレコードが 1 件も無くなれば、種類も外す）
export function withRecords(records: Records, changes: readonly RecordChange[]): Records {
  let next = records
  for (const change of changes) {
    const table = { ...(next[change.subject] ?? {}) }
    if (change.record === REMOVED) delete table[change.id]
    else table[change.id] = change.record
    const { [change.subject]: _, ...rest } = next
    next = Object.keys(table).length === 0 ? rest : { ...rest, [change.subject]: table }
  }
  return next
}

// 残したレコードを今の機能台帳で確かめ、効かないレコード（種類が機能台帳に無い W024・形が合わない W025）の warning を返す。データには手を付けない。
// 役 mails の種類のレコード（郵便）は、郵便の種類で確かめる（core/mail.ts の checkMail。W022・W023）
export function checkRecords(catalog: CoreCatalog, records: Records): Warning[] {
  return Object.entries(records).flatMap(([subject, table]) => {
    const owner = splitId(subject).owner ?? ""
    const def = catalog.subjects.get(subject)
    return Object.entries(table).flatMap(([id, record]) => {
      if (!def) return [warning("W024", owner, { id, subject })]
      if (def.role === "mails") return checkMail(catalog, record)
      return def.record.safeParse(record).success ? [] : [warning("W025", owner, { id, subject })]
    })
  })
}
