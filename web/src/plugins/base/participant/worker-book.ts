// ワーカーブック: ワークルームの作業の資料のブック（tickets-history の中の 1 冊）を引く workKey と名前と、それを書ける者を決める認可ステップ。
// 作業中なら、取り組んでいる物（workroomWork が答えるレコード。チケットなど）の物。空きか、答える種類が無ければ、ワークルーム自身の物

import { type Actor, isAI, NO_WORKROOM, workroomOfActor } from "../../../core/actor"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { PermissionInput } from "../../../core/def/permission"
import { backyardBookOf, rowsWithin } from "../../../core/entries"
import type { BackyardEntry, Folders } from "../../../core/folders"
import { sameWorkKey, type WorkKey } from "../../../core/folders"
import type { RecordReader } from "../../../core/record-source"
import { kit } from "../kit"
import { TICKETS_HISTORY } from "../library/backyards"
import { workRecordNameOf, workRecordNameReadsOf, workroomWorkIn, workroomWorkReadsOf } from "./activity"
import { CLEAR_REQUEST_ID } from "./clear-request-id"
import { WORKROOM } from "./workroom"

// 機能台帳 catalog で、ワーカーブックを引くのに読む種類（ワークルームの作業を答える種類と作業のレコードの名前を引く種類が読む物と、ワークルーム）
export const workerBookReadsOf = (catalog: CoreCatalog): readonly string[] => [
  ...new Set([...workroomWorkReadsOf(catalog), ...workRecordNameReadsOf(catalog), WORKROOM.id]),
]

// 種類 subject の作業のレコードが、ワーカーブックを持てるか（ワークルームの作業を答える種類が workroomWorkSubjects に書き、completesWork を持つ）
const ownsWorkerBook = (catalog: CoreCatalog, subject: string): boolean =>
  !!catalog.subjects.get(subject)?.completesWork &&
  [...catalog.subjects.values()].some(s => s.workroomWork && s.workroomWorkSubjects?.includes(subject))

// ワークルーム workroom のワーカーブックの workKey と名前 title（作業のレコードの短く呼ぶ名前。引けなければレコードの id。ワークルーム自身の物はワークルームの名前で、レコードが無ければ id）。
// read は workerBookReadsOf の種類を読める読み口
export function workerBookOf(
  catalog: CoreCatalog,
  read: RecordReader,
  workroom: string,
): { workKey: WorkKey; title: string } {
  const work = workroomWorkIn(catalog, read, workroom)
  if (work !== "unknown" && work.kind === "working" && ownsWorkerBook(catalog, work.key.subject))
    return { workKey: work.key, title: workRecordNameOf(catalog, read, work.key)?.label ?? work.key.id }
  const room = read.record(WORKROOM.id, workroom) as { name?: unknown }
  return {
    workKey: { subject: WORKROOM.id, id: workroom },
    title: typeof room?.name === "string" ? room.name : workroom,
  }
}

// ワーカーブックがまだ無い（初めてページを足すときに作る）
export const NO_WORKER_BOOK = "no-worker-book"

// 在るワーカーブック: 実のブックの id book と、その中のページの id pages（バインダの中も。並びの順）
export interface FoundWorkerBook {
  book: string
  pages: readonly string[]
}

// 書庫の表 folders で、workKey が key のワーカーブック（tickets-history の中の実のブック）
export function foundWorkerBookOf(folders: Folders, key: WorkKey): FoundWorkerBook | typeof NO_WORKER_BOOK {
  const book = backyardBookOf({ folders }, TICKETS_HISTORY.id, key)
  return book === undefined ? NO_WORKER_BOOK : { book, pages: rowsWithin(folders, book).pages }
}

// AI の行う者 actor がアクション action で、バックヤードのブック entry を書けるか: tickets-history のブックなら、自分のワークルームのワーカーブック（workKey が同じ）だけ。
// 会話を空にする頼み（clear-request）は、自分のワークルームが離れた作業（ワークルームのレコードの left）のワーカーブックにも書ける（引き継ぎのページ）。
// ほかのバックヤードのブックと、利用者は止めない
function writable(input: PermissionInput, actor: Actor, action: string, entry: BackyardEntry | undefined): boolean {
  if (!entry || entry.backyard !== TICKETS_HISTORY.id || !isAI(actor)) return true
  const room = workroomOfActor(actor)
  if (room === NO_WORKROOM) return false
  if (sameWorkKey(workerBookOf(input.catalog, input.read, room).workKey, entry.workKey)) return true
  if (action !== CLEAR_REQUEST_ID) return false
  const record = WORKROOM.record.safeParse(input.read.record(WORKROOM.id, room))
  const left = record.success ? record.data.left : undefined
  return left !== undefined && sameWorkKey(left, entry.workKey)
}

// ワーカーブック: tickets-history のブック（とその中のページ）を書けるのは、そのブックがワーカーブックのワークルームの AI と、利用者だけ（ほかの AI は読むだけ）。
// アノテーションはブックの中身ではないので止めない（ほかの AI も伝言とマークに答えられる）。行った後は、前と後のどちらの側も確かめる
export const WORKER_BOOK = kit.definePermission({
  id: "worker-book",
  title: "Another workroom's worker book",
  aiDescription:
    "the book is the worker book of another workroom's current work (or of a work no workroom has now); you can read it and answer its notes and marks, but only the AI whose current work it is, and the user, can change it (the AI whose workroom left that work can add its handoff page with clear-request)",
  readsSubjects: workerBookReadsOf,
  denies: (q, input) =>
    (q.kind === "page" || q.kind === "folder") &&
    q.action.target !== "annotations" &&
    !writable(input, q.actor, q.action.id, q.backyardEntry),
  keeps: (c, input) =>
    (c.kind !== "page" && c.kind !== "folder") ||
    c.action.target === "annotations" ||
    (writable(input, c.actor, c.action.id, c.backyardEntry.before) &&
      writable(input, c.actor, c.action.id, c.backyardEntry.after)),
})
