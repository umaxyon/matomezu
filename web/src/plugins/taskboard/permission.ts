// 閉じたプロジェクトにチケットを足させない認可ステップ。守るのは、行った後の実際のチケットが指すプロジェクト（アクションの引数ではなく）。
// 閉じたプロジェクトのチケットを直す・消すことは止めない（止めるのは新しく足すときだけ）
import { kit } from "./kit"
import { PROJECT } from "./project"
import { TICKET } from "./ticket"

export const CLOSED_PROJECT = kit.definePermission({
  id: "closed-project",
  title: "closedProject",
  aiDescription: "the project is closed; no ticket can be added to it (a closed project is reopened only by the user)",
  denies: () => false,
  keeps: c =>
    c.kind !== "record" ||
    c.subject !== TICKET.id ||
    c.before !== "none" ||
    !c.refs.some(r => r.subject === PROJECT.id && r.record !== "none" && (r.record as { closed: boolean }).closed),
})
