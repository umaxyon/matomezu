// 会話を空にする頼み（clear-request）: AI が、離れた作業（ワークルームのレコードの left）の引き継ぎのページを、その作業のワーカーブックの最後に足し、
// このターンの終わりに会話を空にするよう頼む。ページを足せたときだけ通り、常駐が頼みを覚えて、ターンの終わりに AI のプログラムの部品が訊いて空にする。
// 引き継ぎと頼みが 1 つのアクションなので、書かずに空にすることは無い。空にできるのは Claude Code（プラグインの mod が空にする）だけで、ほかの AI は断る
import { isAI, NO_WORKROOM, workroomOfActor } from "../../../core/actor"
import type { CoreCatalog } from "../../../core/core-catalog"
import { kit } from "../kit"
import { describeNewPage } from "../pages/page-add"
import { readerIn, workRecordNameOf } from "./activity"
import { workerBookReadsOf } from "./worker-book"
import { PAGE_ARGS, withWorkerPage } from "./worker-page-add"
import { WORKROOM } from "./workroom"

// 参加者の種類の id（参加者の種類は participant/index.ts が定め、そこがこのファイルを読むので、名前で引く）
const PARTICIPANT_ID = kit.name("participant")

// 会話を空にできる AI のプログラムの名前（参加者の ai は MCP が名乗る名前と版。この名前で始まる物。そのプラグインの mod が、ターンの終わりに空にする）
const CLEARABLE_AI = "claude-code"

export const CLEAR_REQUEST = kit.defineAction({
  id: "clear-request",
  aiDescription:
    "Ask to have your conversation cleared at the end of this turn, writing first the handoff of the work your workroom left (left in your workroom's record): add a page with the state of that work (what you were asked, what you found, what is left) at the end of its worker book. The same arguments as worker-page-add (without workroom); a markdown page fits. Returns what worker-page-add returns. Refused when your workroom has not left a work, and when your AI program cannot be cleared from matomezu (only Claude Code can).",
  title: "Write the handoff and clear the conversation",
  target: "library",
  permissionScope: "unknown",
  readsSubjects: (catalog: CoreCatalog) => [...workerBookReadsOf(catalog), PARTICIPANT_ID],
  args: PAGE_ARGS,
  describeArgs: catalog => PAGE_ARGS.extend(describeNewPage(catalog).omit({ index: true }).shape),
  run: (library, page, ctx) => {
    const room = workroomOfActor(ctx.actor)
    if (!isAI(ctx.actor) || room === NO_WORKROOM) return null
    const read = readerIn(ctx)
    const record = WORKROOM.record.safeParse(read.record(WORKROOM.id, room))
    const left = record.success ? record.data.left : undefined
    if (!left) return { declined: "your workroom has not left a work, so there is no handoff to write" }
    const occupant = read
      .find(PARTICIPANT_ID, [{ key: "workroom", eq: room }])
      .find(p => (p as { state?: unknown }).state === "joined") as { ai?: unknown } | undefined
    if (typeof occupant?.ai !== "string" || !occupant.ai.startsWith(CLEARABLE_AI))
      return { declined: "your AI program cannot have its conversation cleared from matomezu (only Claude Code can)" }
    const title = workRecordNameOf(ctx.catalog, read, left)?.label ?? left.id
    return withWorkerPage(library, left, title, page, ctx)
  },
})
