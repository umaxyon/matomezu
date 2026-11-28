// リフレッシュリクエストのアクション（refresh-request）: AI が、引継ぎ対象チケット（ワークルームのレコードの handoffTarget。前の作業のレコード）の
// ワーカーブックの最後に引継ぎページを足し、このターンの終わりに会話を空にするよう頼む（リフレッシュリクエストを返す）。書けたら、ワークルームの引継ぎ対象チケットを外す。
// 引継ぎページを足すのと頼むのが 1 つのアクションなので、書かずに空にすることは無い。空にできると名乗っていない参加者の頼みは、常駐が断る
import { NO_WORKROOM, workroomOfActor } from "../../../core/actor"
import type { CoreCatalog } from "../../../core/core-catalog"
import { kit } from "../kit"
import { MY_WORKDESK } from "../library/system-folders"
import { describeNewPage } from "../pages/page-add"
import { readerIn, workRecordNameOf, workTitleOf } from "./activity"
import { workerBookReadsOf } from "./worker-book"
import { PAGE_ARGS, withWorkerPage } from "./worker-page-add"
import { WORKROOM } from "./workroom"

// 作業のレコードになれる種類（completesWork を持つ種類。引継ぎ対象チケットのレコードが在るかを読む）
const workSubjectsOf = (catalog: CoreCatalog): string[] =>
  [...catalog.subjects.entries()].flatMap(([id, s]) => (s.completesWork ? [id] : []))

export const REFRESH_REQUEST = kit.defineAction({
  id: "refresh-request",
  aiDescription:
    "Write the handoff page of your handoff target (handoffTarget in your workroom's record: the work your workroom had before its current work) and have your conversation cleared at the end of this turn. The page (the same arguments as worker-page-add, without workroom; a markdown page fits) is added at the end of that work's worker book: write the state of that work (what you were asked, what you found, what is left). After the conversation is cleared, the new conversation is told to read that page and your workdesk. Your workroom's handoff target is cleared, so it is written once. Returns what worker-page-add returns. Refused when your workroom has no handoff target or its record is gone, and when your AI program cannot have its conversation cleared from matomezu.",
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
    const text = `Your conversation was refreshed. The handoff page of ${title} is page "${done.result.page}" in book "${done.result.book}": read it with read_page. Then read your workdesk (read_folder with folder "${MY_WORKDESK}") for your current work.`
    return { ...done, others: [{ subject: WORKROOM.id, id: room, record: kept }], refreshRequest: { text } }
  },
})
