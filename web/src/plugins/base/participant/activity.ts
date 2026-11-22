// ワークルームの作業: ワークルームが今なにかに取り組んでいるか（作業中。取り組んでいる物の題名つき）、取り組んでいないか（空き）。
// 参加者リストの並びと、AI のセッション名（作業中なら題名を添える）に使う。ほかの動きを決めない。
// base は自分では決めず、対象の定義に書いた workroomWork に答えさせる（カレントワークを持つプラグインなど）。答える種類が無ければ unknown
import type { CoreCatalog } from "../../../core/core-catalog"
import type { WorkKey } from "../../../core/folders"
import { narrowed, type RecordReader, type RecordSource, readerOf, sourceOf } from "../../../core/record-source"
import type { Records } from "../../../core/records"

// 作業中なら、取り組んでいる物の短い題名 title と、そのレコード key（種類と id）と、それを短く呼ぶ名前 label（例: チケットの番号。作業の資料のブックの名前になる）
export type WorkroomWork = { kind: "working"; title: string; key: WorkKey; label: string } | { kind: "idle" }
export type WorkroomActivity = WorkroomWork["kind"]

declare module "../../../core/catalog" {
  interface SubjectExtras {
    // ワークルーム workroom の作業を答える（作業中なら、取り組んでいる物の短い題名。例: チケットの番号と名前。そのレコードと、短く呼ぶ名前も）。
    // read はレコードの読み口で、読めるのは workroomWorkReads に書いた種類だけ（ほかは none と空）
    workroomWork?(workroom: string, read: RecordReader): WorkroomWork
    // workroomWork が読む種類（読む id が読んだ中身で決まるので、種類ごと宣言する）
    workroomWorkReads?: readonly string[]
  }
}

// 機能台帳 catalog で、ワークルームの作業を答えるのに読む種類（どの種類の workroomWorkReads も合わせた物）
export const workroomWorkReadsOf = (catalog: CoreCatalog): readonly string[] => [
  ...new Set([...catalog.subjects.values()].flatMap(s => (s.workroomWork ? (s.workroomWorkReads ?? []) : []))),
]

// レコードの読み口 read から、ワークルーム workroom の作業を答える: 答える種類のうち、機能台帳の並びで最初に作業中と答えた物。
// 答える種類があってどれも作業中でなければ空き、答える種類が無ければ unknown。どの種類にも、その workroomWorkReads の種類だけを読ませる
export function workroomWorkIn(catalog: CoreCatalog, read: RecordReader, workroom: string): WorkroomWork | "unknown" {
  let answered = false
  for (const s of catalog.subjects.values()) {
    if (!s.workroomWork) continue
    answered = true
    const work = s.workroomWork(workroom, narrowed(read, s.workroomWorkReads ?? []))
    if (work.kind === "working") return work
  }
  return answered ? { kind: "idle" } : "unknown"
}

// 読み口 source から、ワークルーム workroom の作業を答える（workroomWorkIn。読むのは workroomWorkReads に書いた種類だけ）
export const workroomWorkFrom = (
  catalog: CoreCatalog,
  source: RecordSource | undefined,
  workroom: string,
): WorkroomWork | "unknown" =>
  workroomWorkIn(catalog, readerOf(catalog, source, workroomWorkReadsOf(catalog)), workroom)

// 画面が持つレコード records から、ワークルーム workroom の作業を答える
export const workroomWorkOf = (
  catalog: CoreCatalog,
  records: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
  workroom: string,
): WorkroomWork | "unknown" => workroomWorkFrom(catalog, sourceOf(records as Records), workroom)

// ワークルーム workroom の作業の様子（作業中か空き。答える種類が無ければ unknown）
export function workroomActivityOf(
  catalog: CoreCatalog,
  records: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
  workroom: string,
): WorkroomActivity | "unknown" {
  const work = workroomWorkOf(catalog, records, workroom)
  return work === "unknown" ? work : work.kind
}
