// 今の作業が替わったとき: ワークルームの作業を答える種類（workroomWork を持つ種類。カレントワークなど）が変わったら、同じ書き込みで、
// 作業が替わったワークルームのレコードに今の作業（work）と引継ぎ対象チケット（handoffTarget。その前の作業のレコード）を写し、その AI に知らせる常駐メッセージを 1 通送るフォローステップ。
// 誰が替えても（その AI 自身・利用者・ほかの AI）ここが動く。行った AI には、常駐がアクションの答えの notice で渡す。
// 管理者のワークルームの AI にも、替わったワークルーム（管理者のでない物）の全部を 1 通にまとめて知らせる（管理者が自分で替えたとき・管理者がいないときは常駐が送らない）。
// 引継ぎ対象チケットのワーカーブックには、AI がリフレッシュリクエストのアクション（refresh-request）で引継ぎページを書ける（ほかのアクションでは書けない。認可ステップ worker-book）。
// 書くまでは、ターンの終わりに AI のプログラムの部品が止めて書かせる（handoffDueIn）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { AnyRecordRead, RecordRead } from "../../../core/def/action"
import type { FollowStepDef, HostMessage } from "../../../core/def/follow-step"
import { sameWorkKey, type WorkKey } from "../../../core/folders"
import { readerOf, sourceOf } from "../../../core/record-source"
import { kit } from "../kit"
import { MY_WORKDESK } from "../library/system-folders"
import {
  aiWorkroomIdleIn,
  type WorkroomWork,
  workRecordNameReadsOf,
  workroomWorkIn,
  workroomWorkReadsOf,
  workTitleOf,
} from "./activity"
import { REFRESH_REQUEST_ID } from "./refresh-request-id"
import { adminRoomOf } from "./rows"
import { WORKROOM } from "./workroom"

// 管理者の印の種類（index.ts の ADMIN_MARK。index.ts がこのファイルを読むので名前で引く）
const ADMIN_MARK_ID = kit.name("admin-mark")

// 作業を答えるのに読む種類と、作業の名前と、空きのワークルームの AI に添える文が読む種類（どれも全部。ワークルームごとに答えを決めるため）
const readsOf = (catalog: CoreCatalog): string[] => [
  ...new Set([
    ...workroomWorkReadsOf(catalog),
    ...workRecordNameReadsOf(catalog),
    ...[...catalog.subjects.values()].flatMap(s => s.aiWorkroomIdleReads ?? []),
  ]),
]

// 作業を答える種類が変わったら、どのワークルームも作業を答え直し、写した今の作業から替わったワークルームのレコードを直して、その AI に知らせる
export const FOLLOW_WORK_CHANGED: FollowStepDef = {
  watches: { having: "workroomWork" },
  writes: [WORKROOM.id],
  reads: (_change, catalog) =>
    [
      { subject: WORKROOM.id, where: [] },
      { subject: ADMIN_MARK_ID, where: [] },
      ...readsOf(catalog).map((subject): AnyRecordRead => ({ subject, where: [] })),
    ] as readonly RecordRead[],
  follow: (_change, ctx) => {
    const read = readerOf(ctx.catalog, sourceOf(ctx.records), [WORKROOM.id, ADMIN_MARK_ID, ...readsOf(ctx.catalog)])
    const records = []
    const hostMessages: HostMessage[] = []
    const rooms: { id: string; name: string; line: string }[] = []
    for (const found of read.find(WORKROOM.id, [])) {
      const room = WORKROOM.record.safeParse(found)
      if (!room.success) continue
      const now = workroomWorkIn(ctx.catalog, read, room.data.id)
      if (now === "unknown") continue
      const key = now.kind === "working" ? now.key : undefined
      const was = room.data.work
      if (sameWorkKey(was, key)) continue
      const target = was ?? room.data.handoffTarget
      const { work: _work, handoffTarget: _handoffTarget, ...rest } = room.data
      records.push({
        subject: WORKROOM.id,
        id: room.data.id,
        record: { ...rest, ...(key ? { work: key } : {}), ...(target ? { handoffTarget: target } : {}) },
      })
      const title = (k: WorkKey) => workTitleOf(ctx.catalog, read, k)
      const idle = now.kind === "idle" ? aiWorkroomIdleIn(ctx.catalog, read, room.data.id) : ""
      const from = was ? title(was) : ""
      const to = key ? title(key) : ""
      hostMessages.push({ workroom: room.data.id, text: workChangeText(now, from, to, idle) })
      rooms.push({ id: room.data.id, name: room.data.name, line: adminLine(room.data.name, from, to) })
    }
    const admin = adminRoomOf(
      read.find(ADMIN_MARK_ID, []).flatMap(m => {
        const workroom = (m as { workroom?: unknown }).workroom
        return typeof workroom === "string" ? [{ workroom }] : []
      })[0],
      read.find(WORKROOM.id, []).flatMap(r => {
        const id = (r as { id?: unknown }).id
        return typeof id === "string" ? [{ id }] : []
      }),
    )
    const told = rooms.filter(r => r.id !== admin)
    if (admin !== undefined && told.length > 0)
      hostMessages.push({
        workroom: admin,
        text: `The current work of workrooms changed: ${told.map(r => r.line).join(" ")}`,
      })
    return { records, hostMessages }
  },
}

// 管理者への知らせの、ワークルーム name の 1 文（from は替わる前の作業の名前、to は今の作業の名前。空きなら空）
function adminLine(name: string, from: string, to: string): string {
  if (!to) return `${name}: ${from ? `${from} ended` : "its work ended"}, no current work now.`
  return from ? `${name}: from ${from} to ${to}.` : `${name}: now ${to}.`
}

// 作業が now に替わったときの AI への文。from は替わる前の作業の名前（空きから替わったなら空）、to は今の作業の名前（空きなら空）、
// idle は空きになったワークルームの AI に添える文（aiWorkroomIdle。無ければ空）。作業から離れたなら、このターンでは次の作業を始めないよう添える
// （会話を空にできる AI のプログラムは、ターンの終わりに引継ぎページを書かせて空にする。handoffDueIn）
function workChangeText(now: WorkroomWork, from: string, to: string, idle: string): string {
  const desk = `read_folder with folder "${MY_WORKDESK}"`
  const head =
    now.kind === "idle"
      ? `${from ? `${from} ended` : "Your current work ended"}: your workroom has no current work now.${idle ? ` ${idle}` : ""} Your workdesk now shows your workroom's own worker book: read it (${desk}).`
      : `${from ? `Your current work changed from ${from} to ${to}.` : `Your current work is now ${to}.`} Read it: read_records with kind "${now.key.subject}" and id "${now.key.id}". Then read your worker book (the book of your current work): ${desk}. To write to the user about this work (to consult or to ask), add a page to that worker book with worker-page-add instead of making a book with book-create.`
  if (!from) return head
  return `${head} Do not start ${now.kind === "idle" ? "other" : "your new"} work in this turn: if your AI program can have its conversation cleared, at the end of this turn you are asked to write the handoff page of ${from} with ${REFRESH_REQUEST_ID}, and your conversation is cleared.`
}
