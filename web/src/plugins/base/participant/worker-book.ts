// ワーカーブック: ワークルームの作業の資料のブック（tickets-history の中の 1 冊）を引く workKey と名前と、それを書ける者を決める認可ステップ。
// 作業中なら、取り組んでいる物（workroomWork が答えるレコード。チケットなど）の物。空きか、答える種類が無ければ、ワークルーム自身の物

import { type Actor, isAI, workroomOfActor } from "../../../core/actor"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { BackyardEntry, PermissionInput } from "../../../core/def/permission"
import { sameWorkKey, type WorkKey } from "../../../core/folders"
import type { RecordReader } from "../../../core/record-source"
import { kit } from "../kit"
import { TICKETS_HISTORY } from "../library/backyards"
import { workroomWorkIn, workroomWorkReadsOf } from "./activity"

// ワークルームの種類の id（定義 WORKROOM は ./index に在り、そこがこのファイルを読むので、値で読み合わないよう名前から引く）
const WORKROOM_ID = kit.name("workroom")

// 機能台帳 catalog で、ワーカーブックを引くのに読む種類（ワークルームの作業を答える種類が読む物と、ワークルーム）
export const workerBookReadsOf = (catalog: CoreCatalog): readonly string[] => [
  ...new Set([...workroomWorkReadsOf(catalog), WORKROOM_ID]),
]

// ワークルーム workroom のワーカーブックの workKey と名前 title（ワークルームのレコードが無ければ、名前はワークルームの id）。
// read は workerBookReadsOf の種類を読める読み口
export function workerBookOf(
  catalog: CoreCatalog,
  read: RecordReader,
  workroom: string,
): { workKey: WorkKey; title: string } {
  const work = workroomWorkIn(catalog, read, workroom)
  if (work !== "unknown" && work.kind === "working") return { workKey: work.key, title: work.label }
  const room = read.record(WORKROOM_ID, workroom) as { name?: unknown }
  return {
    workKey: { subject: WORKROOM_ID, id: workroom },
    title: typeof room?.name === "string" ? room.name : workroom,
  }
}

// AI の行う者 actor が、バックヤードのブック entry を書けるか: tickets-history のブックなら、自分のワークルームのワーカーブック（workKey が同じ）だけ。
// ほかのバックヤードのブックと、利用者は止めない
function writable(input: PermissionInput, actor: Actor, entry: BackyardEntry | undefined): boolean {
  if (!entry || entry.backyard !== TICKETS_HISTORY.id || !isAI(actor)) return true
  const room = workroomOfActor(actor)
  return room !== undefined && sameWorkKey(workerBookOf(input.catalog, input.read, room).workKey, entry.workKey)
}

// ワーカーブック: tickets-history のブック（とその中のページ）を書けるのは、そのブックがワーカーブックのワークルームの AI と、利用者だけ（ほかの AI は読むだけ）。
// 行った後は、前と後のどちらの側も確かめる
export const WORKER_BOOK = kit.definePermission({
  id: "worker-book",
  title: "Another workroom's worker book",
  aiDescription:
    "the book is the worker book of another workroom's current work (or of a work no workroom has now); you can read it, but only the AI whose current work it is, and the user, can change it",
  reads: workerBookReadsOf,
  denies: (q, input) => q.kind !== "record" && !writable(input, q.actor, q.backyardEntry),
  keeps: (c, input) =>
    c.kind === "record" ||
    (writable(input, c.actor, c.backyardEntry.before) && writable(input, c.actor, c.backyardEntry.after)),
})
