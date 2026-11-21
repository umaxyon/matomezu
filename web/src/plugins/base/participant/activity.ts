// ワークルームの作業の様子: ワークルームが今なにかに取り組んでいるか（作業中）、取り組んでいないか（空き）。参加者リストの並びを見せるためだけの値で、ほかの動きを決めない。
// base は自分では決めず、対象の定義に書いた workroomActivity に答えさせる（カレントワークを持つプラグインなど）。答える種類が無ければ unknown
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Condition } from "../../../core/record-keys"
import { find as findIn, sourceOf } from "../../../core/record-source"
import type { Records } from "../../../core/records"

export type WorkroomActivity = "working" | "idle"

declare module "../../../core/catalog" {
  interface SubjectExtras {
    // ワークルーム workroom の作業の様子を答える（参加者リストの並びを見せるためだけ）。read はレコードを種類と id で読む（無ければ none）。
    // find は種類のレコードのうち、索引キーの条件 where に合う物を読む（アクションの reads の where と同じ書き方）
    workroomActivity?(
      workroom: string,
      read: (subject: string, id: string) => unknown,
      find: (subject: string, where: readonly Condition[]) => readonly unknown[],
    ): WorkroomActivity
  }
}

// 答える種類のどれかが作業中なら作業中、答える種類があってどれも作業中でなければ空き、答える種類が無ければ unknown
export function workroomActivityOf(
  catalog: CoreCatalog,
  records: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
  workroom: string,
): WorkroomActivity | "unknown" {
  const read = (subject: string, id: string) => records[subject]?.[id] ?? "none"
  const source = sourceOf(records as Records)
  const find = (subject: string, where: readonly Condition[]) =>
    Object.values(findIn(catalog, source, subject, where)).map(r => r.record)
  const answers = [...catalog.subjects.values()].flatMap(s =>
    s.workroomActivity ? [s.workroomActivity(workroom, read, find)] : [],
  )
  if (answers.length === 0) return "unknown"
  return answers.includes("working") ? "working" : "idle"
}
