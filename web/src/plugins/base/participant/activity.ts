// ワークルームの作業: ワークルームが今なにかに取り組んでいるか（作業中。取り組んでいる物の題名つき）、取り組んでいないか（空き）。
// 参加者リストの並びと、AI のセッション名（作業中なら題名を添える）に使う。ほかの動きを決めない。
// base は自分では決めず、対象の定義に書いた workroomWork に答えさせる（カレントワークを持つプラグインなど）。答える種類が無ければ unknown
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Condition } from "../../../core/record-keys"
import { find as findIn, type RecordSource, sourceOf } from "../../../core/record-source"
import type { Records } from "../../../core/records"

export type WorkroomWork = { kind: "working"; title: string } | { kind: "idle" }
export type WorkroomActivity = WorkroomWork["kind"]

declare module "../../../core/catalog" {
  interface SubjectExtras {
    // ワークルーム workroom の作業を答える（作業中なら、取り組んでいる物の短い題名。例: チケットの番号と名前）。read はレコードを種類と id で読む（無ければ none）。
    // find は種類のレコードのうち、索引キーの条件 where に合う物を読む（アクションの reads の where と同じ書き方）
    workroomWork?(
      workroom: string,
      read: (subject: string, id: string) => unknown,
      find: (subject: string, where: readonly Condition[]) => readonly unknown[],
    ): WorkroomWork
  }
}

// レコードの読み口 source から、ワークルーム workroom の作業を答える: 答える種類のうち、機能台帳の並びで最初に作業中と答えた物。
// 答える種類があってどれも作業中でなければ空き、答える種類が無ければ unknown
export function workroomWorkIn(catalog: CoreCatalog, source: RecordSource, workroom: string): WorkroomWork | "unknown" {
  const read = (subject: string, id: string) => source.byId(subject, id) ?? "none"
  const find = (subject: string, where: readonly Condition[]) =>
    Object.values(findIn(catalog, source, subject, where)).map(r => r.record)
  let answered = false
  for (const s of catalog.subjects.values()) {
    if (!s.workroomWork) continue
    answered = true
    const work = s.workroomWork(workroom, read, find)
    if (work.kind === "working") return work
  }
  return answered ? { kind: "idle" } : "unknown"
}

// 画面が持つレコード records から、ワークルーム workroom の作業を答える（workroomWorkIn）
export const workroomWorkOf = (
  catalog: CoreCatalog,
  records: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
  workroom: string,
): WorkroomWork | "unknown" => workroomWorkIn(catalog, sourceOf(records as Records), workroom)

// ワークルーム workroom の作業の様子（作業中か空き。答える種類が無ければ unknown）
export function workroomActivityOf(
  catalog: CoreCatalog,
  records: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
  workroom: string,
): WorkroomActivity | "unknown" {
  const work = workroomWorkOf(catalog, records, workroom)
  return work === "unknown" ? work : work.kind
}
