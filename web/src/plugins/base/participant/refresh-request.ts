// リフレッシュリクエストのアクション（refresh-request）: AI が、引継ぎページを書く先の作業（ワークルームのレコードの引継ぎ対象チケット handoffTarget。
// 無ければ今の作業 work）のワーカーブックの最後に引継ぎページを足し、このターンの終わりに会話を空にするよう頼む（リフレッシュリクエストを返す）。
// 引継ぎ対象チケットに書けたら、ワークルームの引継ぎ対象チケットを外す（今の作業に書いたときは、ワークルームのレコードを変えない）。
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
    "Write the handoff page and have your conversation cleared at the end of this turn. The page (the same arguments as worker-page-add, without workroom; a markdown page fits) is added at the end of the worker book of your handoff target (handoffTarget in your workroom's record: the work your workroom had before its current work), or of your current work (work in your workroom's record) when there is no handoff target: write the state of that work (what you were asked, what you found, what is left). After the conversation is cleared, the new conversation is told to read that page and your workdesk. When the page goes to your handoff target, your workroom's handoff target is cleared, so it is written once. Returns what worker-page-add returns. Refused when your workroom has neither a handoff target nor a current work, when the record of that work is gone, and when your AI program cannot have its conversation cleared from matomezu.",
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
    const target = record.success ? (record.data.handoffTarget ?? record.data.work) : undefined
    if (!record.success || !target)
      return {
        declined:
          "your workroom has neither a handoff target nor a current work, so there is no worker book for the handoff page",
      }
    if (read.record(target.subject, target.id) === "none")
      return { declined: "the record of that work is gone, so its worker book cannot have a handoff page" }
    const fromHandoff = record.data.handoffTarget !== undefined
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
    return {
      ...done,
      ...(fromHandoff ? { others: [{ subject: WORKROOM.id, id: room, record: kept }] } : {}),
      refreshRequest: { text },
    }
  },
})
