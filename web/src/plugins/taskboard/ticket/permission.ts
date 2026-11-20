// 閉じたプロジェクトを守る認可ステップ: チケットを足させず、プロジェクトは開け直すほかは直させない。守るのは、行った後の実際のレコード（アクションの引数ではなく）。
// 閉じたプロジェクトのチケットを直す・消すことは止めない（止めるのは新しく足すときだけ）

import { kit } from "../kit"
import { PROJECT } from "../project"
import { PROJECT_REOPEN } from "../project/actions"
import { TICKET } from "./ticket"

// レコード record（none・removed のこともある）が、閉じたプロジェクトか
const closed = (record: unknown) =>
  typeof record === "object" && record !== null && (record as { closed?: unknown }).closed === true

export const CLOSED_PROJECT = kit.definePermission({
  id: "closed-project",
  title: "closedProject",
  aiDescription:
    "the project is closed; no ticket can be added to it and the project cannot be changed until it is reopened (project-reopen)",
  // 行う前: 閉じたプロジェクトを、開け直すほかで変えようとしている
  denies: q => q.kind === "record" && q.subject === PROJECT.id && closed(q.record) && q.action.id !== PROJECT_REOPEN.id,
  keeps: c => {
    if (c.kind !== "record") return true
    if (c.subject === PROJECT.id) return !(closed(c.before) && closed(c.after))
    return (
      c.subject !== TICKET.id || c.before !== "none" || !c.refs.some(r => r.subject === PROJECT.id && closed(r.record))
    )
  },
})
