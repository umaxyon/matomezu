// カレントワーク: ワークルームが今やっているチケット 1 つ、または無し（none）。ワークルームごとに 1 件のレコードで、id はワークルームの id（1 ワークルーム 1 件を形で決める）。
// カレントチケットは、カレントワークが指すチケットのうち、そのワークルームを担当に持ち、作業中のレーンにある物（currentTicketOf の 1 つの判定）。
// レコードが古くなっても（レーンの作業中の印を外した・ワークルームを消したなど）、読む側がこの判定で外すので、見せる物は食い違わない。
// チケットとプロジェクトが変わったら、フォローステップ（follow.ts）が、それを指すカレントワークを同じトランザクションで直す
import { z } from "zod"
import type { ActionContext, RecordRead } from "../../../plugin-api"
import { kit } from "../kit"
import { PROJECT, type Project } from "../project"
import { inWorkingLane } from "../project/project"
import type { TicketLike } from "../ticket/current"
import { TICKET, type Ticket } from "../ticket/ticket"

// カレントワークの種類の id（定義 CURRENT_WORK の workroomWork が、定義より先に使う）と、無いことを表す値
export const CURRENT_WORK_ID = kit.name("current-work")
export const NO_TICKET = "none"

// チケット ticket が、ワークルーム workroom のカレントチケットになれるか: 担当に入っていて、プロジェクトの作業中のレーンにある
export const isCurrentFor = (ticket: TicketLike, workroom: string, project: Project | undefined): boolean =>
  project !== undefined && ticket.assignees.includes(workroom) && inWorkingLane(project, ticket.lane)

// ワークルーム workroom のカレントワークを ticket（チケットの id か none）にする、others の 1 件
export const currentWorkSet = (workroom: string, ticket: string) => ({
  subject: CURRENT_WORK_ID,
  id: workroom,
  record: { id: workroom, ticket },
})

// プロジェクトが before から after に変わったとき（レーンの作業中の印を付けた・外した、レーンを消した）の、カレントワークの直し（others）。
// tickets はそのプロジェクトのチケット、works は読んだカレントワーク。チケットの変更と同じ決まり:
// - このプロジェクトのチケットを指すカレントワークのうち、カレントチケットでなくなった物を none にする
// - 新しくカレントチケットになれたワークルームで、カレントワークが none（になった物も含む）の物は、そのチケットにする（更新の新しい順で先の 1 枚）
export function currentWorkOnLanes(
  before: Project,
  after: Project,
  tickets: readonly (TicketLike & { id: string })[],
  works: readonly { id: string; ticket: string }[],
): ReturnType<typeof currentWorkSet>[] {
  const byId = new Map(tickets.map(t => [t.id, t]))
  const now = new Map(works.map(w => [w.id, w.ticket]))
  const changes = new Map<string, string>()
  for (const w of works) {
    const t = byId.get(w.ticket)
    if (t && !isCurrentFor(t, w.id, after)) {
      changes.set(w.id, NO_TICKET)
      now.set(w.id, NO_TICKET)
    }
  }
  const newest = [...tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number - b.number)
  for (const t of newest)
    for (const room of t.assignees) {
      if (!isCurrentFor(t, room, after) || isCurrentFor(t, room, before)) continue
      if ((now.get(room) ?? NO_TICKET) !== NO_TICKET) continue
      changes.set(room, t.id)
      now.set(room, t.id)
    }
  return [...changes].flatMap(([room, ticket]) =>
    (works.find(w => w.id === room)?.ticket ?? NO_TICKET) === ticket ? [] : [currentWorkSet(room, ticket)],
  )
}

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
    "The current work of a workroom (the record's id is the workroom's id): ticket is the ticket the workroom is working on now, or none. Its current ticket is that ticket while the workroom is one of its assignees and it is in a working lane of its project. It is filled when a ticket that a workroom with no current work is assigned to comes into a working lane (or the workroom is assigned to a ticket in a working lane), changed with ticket-start, emptied with ticket-leave, and emptied when the ticket is completed or removed, or leaves the working lanes (also when the working mark of its lane is taken off) or the workroom's assignment; it is filled likewise when a lane gets the working mark.",
  record: CURRENT_WORK_RECORD,
  refers: w => (w.ticket === NO_TICKET ? [] : [{ subject: TICKET.id, id: w.ticket }]),
  keys: {
    ticket: { type: "text", of: w => w.ticket },
  },
  aiBrief: w => w.ticket,
  workroomWorkReads: [CURRENT_WORK_ID, TICKET.id, PROJECT.id],
  workroomWorkSubjects: [TICKET.id],
  // 参加者リストの並びとセッション名・作業の資料のブック: カレントチケットがあれば作業中で、レコードはチケット（名前はチケットの定義の workRecordName）
  workroomWork: (workroom, read) => {
    const current = currentTicketOf(
      workroom,
      parsed(CURRENT_WORK_RECORD, read.record(CURRENT_WORK_ID, workroom)),
      id => parsed(TICKET.record, read.record(TICKET.id, id)),
      id => parsed(PROJECT.record, read.record(PROJECT.id, id)),
    )
    return current ? { kind: "working", key: { subject: TICKET.id, id: current.ticket.id } } : { kind: "idle" }
  },
})

export type CurrentWork = z.output<typeof CURRENT_WORK.record>

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
