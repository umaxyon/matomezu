import type { CoreCatalog } from "./core-catalog"
import { splitId } from "./names"
import { type Warning, warning } from "./warnings"

// レコード: 対象の定義（core/def/subject.ts）が足した種類のデータ。種類ごとに id → レコード 1 件（中は種類の形。core は読まない）。
// アクションが 1 回に変えるレコードは 1 件で、新しく作る（on の record が無い。受け取るのは none）か、直すか、消す（返すのは removed）
export type Records = Readonly<Record<string, Readonly<Record<string, unknown>>>>

// アクションが変えたレコード 1 件（record は新しいレコードか、消したなら removed）
export interface RecordChange {
  subject: string
  id: string
  record: unknown
  counters?: Readonly<Record<string, number>> // 番号を振った区切りごとの、次の番号（レコードを書くのと同じ 1 回の書き込みで進める）
}

// 番号を振る種類ごとの、区切り → 次の番号（種類の id → 区切り → 次の番号。使い回さないので、レコードを消しても戻さない）
export type Counters = Readonly<Record<string, Readonly<Record<string, number>>>>

export const NO_RECORD = "none"
export const REMOVED = "removed"

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

// レコード 1 件の変更を当てた、新しいレコード（消したなら、その種類の中から外す。種類のレコードが 1 件も無くなれば、種類も外す）
// 番号を進めた変更を当てた、新しい番号の表
export function withCounters(counters: Counters, change: RecordChange): Counters {
  return change.counters === undefined
    ? counters
    : { ...counters, [change.subject]: { ...(counters[change.subject] ?? {}), ...change.counters } }
}

export function withRecord(records: Records, change: RecordChange): Records {
  const table = { ...(records[change.subject] ?? {}) }
  if (change.record === REMOVED) delete table[change.id]
  else table[change.id] = change.record
  const { [change.subject]: _, ...rest } = records
  return Object.keys(table).length === 0 ? rest : { ...rest, [change.subject]: table }
}

// 残したレコードを今の機能台帳で確かめ、効かないレコード（種類が機能台帳に無い W024・形が合わない W025）の warning を返す。データには手を付けない
export function checkRecords(catalog: CoreCatalog, records: Records): Warning[] {
  return Object.entries(records).flatMap(([subject, table]) => {
    const owner = splitId(subject).owner ?? ""
    const def = catalog.subjects.get(subject)
    return Object.entries(table).flatMap(([id, record]) => {
      if (!def) return [warning("W024", owner, { id, subject })]
      return def.record.safeParse(record).success ? [] : [warning("W025", owner, { id, subject })]
    })
  })
}
