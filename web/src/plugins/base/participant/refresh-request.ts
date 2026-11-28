// リフレッシュリクエストのアクション（refresh-request）: AI が、引継ぎ対象チケット（ワークルームのレコードの handoffTarget。前の作業のレコード）の
// ワーカーブックの最後に引継ぎページを足し、このターンの終わりに会話を空にするよう頼む（リフレッシュリクエストを返す）。書けたら、ワークルームの引継ぎ対象チケットを外す。
// 引継ぎページを足すのと頼むのが 1 つのアクションなので、書かずに空にすることは無い。空にできると名乗っていない参加者の頼みは、常駐が断る。
// 引継ぎ対象チケットがある間は、ターンの終わりに AI のプログラムの部品が止めて書かせる（handoffDueIn の文を常駐が渡す）。
// 空にしたあとの会話は、利用者に、作業を替えるときに一緒に出した指示をもう一度出してもらう
import { NO_WORKROOM, workroomOfActor } from "../../../core/actor"
import type { CoreCatalog } from "../../../core/core-catalog"
import { type RecordSource, readerOf } from "../../../core/record-source"
import { kit } from "../kit"
import { MY_WORKDESK } from "../library/system-folders"
import { describeNewPage } from "../pages/page-add"
import { readerIn, workRecordNameOf, workRecordNameReadsOf, workTitleOf } from "./activity"
import { REFRESH_REQUEST_ID } from "./refresh-request-id"
import { workerBookReadsOf } from "./worker-book"
import { PAGE_ARGS, withWorkerPage } from "./worker-page-add"
import { WORKROOM } from "./workroom"

// 作業のレコードになれる種類（completesWork を持つ種類。引継ぎ対象チケットのレコードが在るかを読む）
const workSubjectsOf = (catalog: CoreCatalog): string[] =>
  [...catalog.subjects.entries()].flatMap(([id, s]) => (s.completesWork ? [id] : []))

export const REFRESH_REQUEST = kit.defineAction({
  id: "refresh-request",
  aiDescription:
    "Write the handoff page of your handoff target (handoffTarget in your workroom's record: the work your workroom had before its current work) and have your conversation cleared at the end of this turn. The page (the same arguments as worker-page-add, without workroom; a markdown page fits) is added at the end of that work's worker book: write the state of that work (what you were asked, what you found, what is left). After the conversation is cleared, the new conversation is told to read that page and your workdesk, and to ask the user to give again any instructions given together with the change of work. While your workroom has a handoff target, you are asked for this at the end of each turn. Your workroom's handoff target is cleared, so it is written once. Returns what worker-page-add returns. Refused when your workroom has no handoff target or its record is gone, and when your AI program cannot have its conversation cleared from matomezu.",
  title: "Write the handoff page and refresh the conversation",
  target: "library",
  permissionScope: "unknown",
  writes: [WORKROOM.id],
  readsSubjects: (catalog: CoreCatalog) => [...new Set([...workerBookReadsOf(catalog), ...workSubjectsOf(catalog)])],
  args: PAGE_ARGS,
  describeArgs: catalog => PAGE_ARGS.extend(describeNewPage(catalog).omit({ index: true }).shape),
  run: (library, page, ctx) => {
    const room = workroomOfActor(ctx.actor)
    if (room === NO_WORKROOM) return null
    const read = readerIn(ctx)
    const record = WORKROOM.record.safeParse(read.record(WORKROOM.id, room))
    const target = record.success ? record.data.handoffTarget : undefined
    if (!record.success || !target)
      return { declined: "your workroom has no handoff target, so there is no handoff page to write" }
    if (read.record(target.subject, target.id) === "none")
      return { declined: "the record of your handoff target is gone, so its worker book cannot have a handoff page" }
    const { handoffTarget: _, ...kept } = record.data
    const done = withWorkerPage(
      library,
      target,
      workRecordNameOf(ctx.catalog, read, target)?.label ?? target.id,
      page,
      ctx,
    )
    if (!done) return null
    const title = workTitleOf(ctx.catalog, read, target)
    const text = `Your conversation was refreshed. The handoff page of ${title} is page "${done.result.page}" in book "${done.result.book}": read it with read_page. Then read your workdesk (read_folder with folder "${MY_WORKDESK}") for your current work. Then tell the user that your conversation was cleared because you left ${title}, and that any instructions given together with the change of work should be given again; wait for them, and do not start your current work before that.`
    return { ...done, others: [{ subject: WORKROOM.id, id: room, record: kept }], refreshRequest: { text } }
  },
})

// ワークルーム room の AI が、ターンを終える前に書く引継ぎページの頼み（refresh-request を行えと AI に渡す英語の文）。
// 引継ぎ対象チケットが無い・そのレコードが無い（書けない）なら空。常駐が、ターンの終わりのフックに、会話を空にできる AI のプログラムにだけ渡す
export function handoffDueIn(catalog: CoreCatalog, source: RecordSource, room: string): string {
  const read = readerOf(catalog, source, [WORKROOM.id, ...workSubjectsOf(catalog), ...workRecordNameReadsOf(catalog)])
  const record = WORKROOM.record.safeParse(read.record(WORKROOM.id, room))
  const target = record.success ? record.data.handoffTarget : undefined
  if (!target || read.record(target.subject, target.id) === "none") return ""
  const title = workTitleOf(catalog, read, target)
  return `You left ${title}. Before you stop, perform ${REFRESH_REQUEST_ID} with the handoff page of ${title} (its state: what you were asked, what you found, what is left); your conversation is cleared at the end of this turn. Do not start other work now.`
}
