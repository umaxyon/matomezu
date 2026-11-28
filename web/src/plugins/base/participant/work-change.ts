// 今の作業が替わったとき: ワークルームの作業を答える種類（workroomWork を持つ種類。カレントワークなど）が変わったら、同じ書き込みで、
// 作業が替わったワークルームのレコードに今の作業（work）と引継ぎ対象チケット（handoffTarget。その前の作業のレコード）を写し、その AI に知らせる常駐メッセージを 1 通送るフォローステップ。
// 誰が替えても（その AI 自身・利用者・ほかの AI）ここが動く。行った AI には、常駐がアクションの答えの notice で渡す。
// 引継ぎ対象チケットのワーカーブックには、AI がリフレッシュリクエストのアクション（refresh-request）で引継ぎページを書ける（ほかのアクションでは書けない。認可ステップ worker-book）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { AnyRecordRead, RecordRead } from "../../../core/def/action"
import type { FollowStepDef, HostMessage } from "../../../core/def/follow-step"
import { sameWorkKey, type WorkKey } from "../../../core/folders"
import { readerOf, sourceOf } from "../../../core/record-source"
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
import { WORKROOM } from "./workroom"

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
      ...readsOf(catalog).map((subject): AnyRecordRead => ({ subject, where: [] })),
    ] as readonly RecordRead[],
  follow: (_change, ctx) => {
    const read = readerOf(ctx.catalog, sourceOf(ctx.records), [WORKROOM.id, ...readsOf(ctx.catalog)])
    const records = []
    const hostMessages: HostMessage[] = []
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
      hostMessages.push({
        workroom: room.data.id,
        text: workChangeText(now, was ? title(was) : "", key ? title(key) : "", idle),
      })
    }
    return { records, hostMessages }
  },
}

// 作業が now に替わったときの AI への文。from は替わる前の作業の名前（空きから替わったなら空）、to は今の作業の名前（空きなら空）、
// idle は空きになったワークルームの AI に添える文（aiWorkroomIdle。無ければ空）。作業から離れたなら、引継ぎページを書いて会話をリフレッシュする頼み方を添える
function workChangeText(now: WorkroomWork, from: string, to: string, idle: string): string {
  const desk = `read_folder with folder "${MY_WORKDESK}"`
  const head =
    now.kind === "idle"
      ? `${from ? `${from} ended` : "Your current work ended"}: your workroom has no current work now.${idle ? ` ${idle}` : ""} Your workdesk now shows your workroom's own worker book: read it (${desk}).`
      : `${from ? `Your current work changed from ${from} to ${to}.` : `Your current work is now ${to}.`} Read it: read_records with kind "${now.key.subject}" and id "${now.key.id}". Then read your worker book (the book of your current work): ${desk}. To write to the user about this work (to consult or to ask), add a page to that worker book with worker-page-add instead of making a book with book-create.`
  if (!from) return head
  return `${head} If your conversation should be cleared for what comes next, perform ${REFRESH_REQUEST_ID} with the handoff page of ${from} (its state: what you were asked, what you found, what is left), added to its worker book; the conversation is then cleared after this turn.`
}
