// カレントワーク: ワークルームが今やっているチケット 1 つ、または無し（none）。ワークルームごとに 1 件のレコードで、id はワークルームの id（1 ワークルーム 1 件を形で決める）。
// カレントチケットは、カレントワークが指すチケットのうち、そのワークルームを担当に持ち、作業中のレーンにある物（currentTicketOf の 1 つの判定）。
// レコードが古くなっても（レーンの作業中の印を外した・ワークルームを消したなど）、読む側がこの判定で外すので、見せる物は食い違わない。
// チケットのアクションは、変えたチケットを指すカレントワークを同じトランザクションで直す（currentWorkChanges）
import { z } from "zod"
import type { ActionContext, RecordRead } from "../../../plugin-api"
import { kit } from "../kit"
import { inWorkingLane, PROJECT, type Project } from "../project"
import type { TicketLike } from "../ticket/current"
import { TICKET, type Ticket } from "../ticket/ticket"

// カレントワークが無いことを表す値
export const NO_TICKET = "none"

const CURRENT_WORK_RECORD = z.strictObject({
  id: z.string().min(1),
  ticket: z.string().min(1), // チケットの id か none
})

// 形 schema に合えばその値、合わなければ undefined
const parsed = <T>(schema: z.ZodType<T>, value: unknown): T | undefined => {
  const r = schema.safeParse(value)
  return r.success ? r.data : undefined
}

export const CURRENT_WORK = kit.defineSubject({
  id: "current-work",
  title: "current work",
  aiDescription:
    "The current work of a workroom (the record's id is the workroom's id): ticket is the ticket the workroom is working on now, or none. Its current ticket is that ticket while the workroom is one of its assignees and it is in a working lane of its project. It is filled when a ticket that a workroom with no current work is assigned to comes into a working lane (or the workroom is assigned to a ticket in a working lane), changed with ticket-start, emptied with ticket-leave, and emptied when the ticket is completed or removed, or leaves the working lanes or the workroom's assignment.",
  record: CURRENT_WORK_RECORD,
  refers: w => (w.ticket === NO_TICKET ? [] : [{ subject: TICKET.id, id: w.ticket }]),
  keys: {
    ticket: { type: "text", of: w => w.ticket },
  },
  aiBrief: w => w.ticket,
  // 参加者リストの並びを見せるためだけ: カレントチケットがあれば作業中
  workroomActivity: (workroom, read) =>
    currentTicketOf(
      workroom,
      parsed(CURRENT_WORK_RECORD, read(CURRENT_WORK_KIND, workroom)),
      id => parsed(TICKET.record, read(TICKET.id, id)),
      id => parsed(PROJECT.record, read(PROJECT.id, id)),
    )
      ? "working"
      : "idle",
})

const CURRENT_WORK_KIND = kit.name("current-work") // 作業の様子で自分の種類を引く（定義の中から CURRENT_WORK を指さない）

export type CurrentWork = z.output<typeof CURRENT_WORK.record>

// チケット ticket が、ワークルーム workroom のカレントチケットになれるか: 担当に入っていて、プロジェクトの作業中のレーンにある
export const isCurrentFor = (ticket: TicketLike, workroom: string, project: Project | undefined): boolean =>
  project !== undefined && ticket.assignees.includes(workroom) && inWorkingLane(project, ticket.lane)

// ワークルーム workroom のカレントチケット（無ければ undefined）。work はそのワークルームのカレントワーク（無ければ undefined）、ticketOf と projectOf はチケットとプロジェクトを id で引く
export function currentTicketOf<T extends TicketLike & { id: string }>(
  workroom: string,
  work: { ticket: string } | undefined,
  ticketOf: (id: string) => T | undefined,
  projectOf: (id: string) => Project | undefined,
): { ticket: T; project: Project } | undefined {
  if (!work || work.ticket === NO_TICKET) return undefined
  const ticket = ticketOf(work.ticket)
  if (!ticket) return undefined
  const project = projectOf(ticket.project)
  return project && isCurrentFor(ticket, workroom, project) ? { ticket, project } : undefined
}

// カレントワークを直すアクションが読む物: 全部のカレントワーク（ワークルームごとに 1 件なので少ない）
export const READS_CURRENT_WORK: RecordRead = { subject: CURRENT_WORK.id, where: [] }

// アクションが読んだカレントワーク（READS_CURRENT_WORK を読んだ文脈）
export const currentWorksOf = (ctx: Pick<ActionContext, "records">): CurrentWork[] =>
  Object.values(ctx.records?.[CURRENT_WORK.id] ?? {}).flatMap(r => {
    const work = CURRENT_WORK.record.safeParse(r)
    return work.success ? [work.data] : []
  })

// ワークルーム workroom のカレントワークを ticket（チケットの id か none）にする、others の 1 件
export const currentWorkSet = (workroom: string, ticket: string) => ({
  subject: CURRENT_WORK.id,
  id: workroom,
  record: { id: workroom, ticket },
})

// チケットが before（作る前は none）から after（消したら removed）に変わったときの、カレントワークの直し（others）。
// project はチケットのプロジェクト、works は読んだカレントワーク。
// - そのチケットを指すカレントワークのうち、カレントチケットでなくなったワークルームの物を none にする
// - 新しくカレントチケットになれたワークルーム（担当に入った・作業中のレーンに入った）で、カレントワークが none の物は、このチケットにする。
//   ほかのチケットを指したまま古くなったカレントワーク（そのレーンの作業中の印を外したなど）は、ここでは埋めない（そのチケットを読まないため）
export function currentWorkChanges(
  before: Ticket | "none",
  after: Ticket | "removed",
  project: Project | undefined,
  works: readonly CurrentWork[],
): ReturnType<typeof currentWorkSet>[] {
  const id = before === "none" ? (after === "removed" ? undefined : after.id) : before.id
  if (id === undefined) return []
  const can = (t: Ticket | "none" | "removed", w: string) =>
    t !== "none" && t !== "removed" && isCurrentFor(t, w, project)
  const byRoom = new Map(works.map(w => [w.id, w]))
  const emptied = works.filter(w => w.ticket === id && !can(after, w.id)).map(w => currentWorkSet(w.id, NO_TICKET))
  const filled =
    after === "removed"
      ? []
      : after.assignees
          .filter(w => can(after, w) && !can(before, w))
          .filter(w => (byRoom.get(w)?.ticket ?? NO_TICKET) === NO_TICKET)
          .map(w => currentWorkSet(w, id))
  return [...emptied, ...filled]
}
