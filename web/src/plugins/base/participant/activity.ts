// ワークルームの作業: ワークルームが今なにかに取り組んでいるか（作業中。取り組んでいるレコードつき）、取り組んでいないか（空き）。
// 参加者リストの並びと、AI のセッション名（作業中なら作業のレコードの名前を添える）に使う。ほかの動きを決めない。
// base は自分では決めず、対象の定義に書いた workroomWork に答えさせる（カレントワークを持つプラグインなど）。答える種類が無ければ unknown。
// 作業のレコードの名前（番号と名前）は、そのレコードの種類の定義に書いた workName に答えさせる
import type { CoreCatalog } from "../../../core/core-catalog"
import type { WorkKey } from "../../../core/folders"
import { type RecordReader, type RecordSource, readerOf, sourceOf } from "../../../core/record-source"
import type { Records } from "../../../core/records"
import { NO_RECORD } from "../../../core/records"

// アクションの ctx が持つ、宣言した種類のレコードを読む口（ctx.record・ctx.find）。無ければ、どの種類も none と空
export const readerIn = (ctx: { record?: RecordReader["record"]; find?: RecordReader["find"] }): RecordReader => ({
  record: ctx.record ?? (() => NO_RECORD),
  find: ctx.find ?? (() => []),
})

// 読み口 reader を、種類 subjects だけに絞った読み口（ほかの種類は none と空）
function narrowed(reader: RecordReader, subjects: Iterable<string>): RecordReader {
  const allowed = new Set(subjects)
  return {
    record: (subject, id) => (allowed.has(subject) ? reader.record(subject, id) : NO_RECORD),
    find: (subject, where) => (allowed.has(subject) ? reader.find(subject, where) : []),
  }
}

// 作業中なら、取り組んでいるレコード key（種類と id）
export type WorkroomWork = { kind: "working"; key: WorkKey } | { kind: "idle" }
export type WorkroomActivity = WorkroomWork["kind"]

declare module "../../../core/catalog" {
  interface SubjectExtras {
    // ワークルーム workroom の作業を答える（作業中なら、取り組んでいるレコード）。
    // read はレコードの読み口で、読めるのは workroomWorkReads に書いた種類だけ（ほかは none と空）
    workroomWork?(workroom: string, read: RecordReader): WorkroomWork
    // workroomWork が読む種類（読む id が読んだ中身で決まるので、種類ごと宣言する）
    workroomWorkReads?: readonly string[]
    // workroomWork が答える作業のレコードの種類（key の種類）。どれも completesWork と workName を持つ（台帳アセンブルが確かめる。E133）。
    // ここに無い種類を答えたら、その作業のワーカーブックは作らず、ワークルーム自身のブックを使う
    workroomWorkSubjects?: readonly string[]
    // 作業のレコード record の名前（workroomWorkSubjects に書かれた種類が書く）。読めない物があって決まらなければ undefined。
    // read はレコードの読み口で、読めるのは workNameReads に書いた種類だけ（ほかは none と空）
    workName?(record: unknown, read: RecordReader): WorkName | undefined
    // workName が読む種類
    workNameReads?: readonly string[]
  }
}

// 作業のレコードの名前: 短く呼ぶ名前 label（例: チケットの番号。ワーカーブックの名前になる）と、名前 name（例: チケットの名前）
export interface WorkName {
  label: string
  name: string
}

// 作業のレコードの名前を一続きにした題名（例「M-0177 名前」）
export const workTitleOf = (name: WorkName): string => `${name.label} ${name.name}`

// 機能台帳 catalog で、作業のレコードの名前を引くのに読む種類（workName を持つ種類と、その workNameReads）
export const workNameReadsOf = (catalog: CoreCatalog): readonly string[] => [
  ...new Set([...catalog.subjects.values()].flatMap(s => (s.workName ? [s.id, ...(s.workNameReads ?? [])] : []))),
]

// 読み口 read から、作業のレコード key の名前（種類が workName を持たない・レコードが無い・決まらなければ undefined）。
// 種類には、その workNameReads の種類だけを読ませる
export function workNameOf(catalog: CoreCatalog, read: RecordReader, key: WorkKey): WorkName | undefined {
  const def = catalog.subjects.get(key.subject)
  if (!def?.workName) return undefined
  const record = read.record(key.subject, key.id)
  return record === NO_RECORD ? undefined : def.workName(record, narrowed(read, def.workNameReads ?? []))
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
