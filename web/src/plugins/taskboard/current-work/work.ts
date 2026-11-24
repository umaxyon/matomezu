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
import { ticketLabel } from "../ticket/label"
import { TICKET, type Ticket } from "../ticket/ticket"

// カレントワークの種類の id（定義 CURRENT_WORK の workroomWork が、定義より先に使う）と、無いことを表す値
export const CURRENT_WORK_ID = kit.name("current-work")
export const NO_TICKET = "none"

// チケット ticket が、ワークルーム workroom のカレントチケットになれるか: 担当に入っていて、プロジェクトの作業中のレーンにある
export const isCurrentFor = (ticket: TicketLike, workroom: string, project: Project | undefined): boolean =>
  project !== undefined && ticket.assignees.includes(workroom) && inWorkingLane(project, ticket.lane)

// 担当のいるチケット（完了したチケットは担当を持たないので、まだ終わっていない物だけ）と、全部のプロジェクト。
// カレントチケットが終わったときに、そのワークルームの次を選ぶのに読む
const ASSIGNED = [{ key: "assigned", gt: 0 }] as const
export const READS_ASSIGNED_TICKETS: RecordRead = { subject: TICKET.id, where: ASSIGNED }
export const READS_PROJECTS: RecordRead = { subject: PROJECT.id, where: [] }

// ワークルーム workroom がカレントチケットにできる、担当で作業中のレーンにあるチケット（except の id を除く）。更新の新しい順、次に番号
export function workingTicketsOf<T extends TicketLike & { id: string }>(
  workroom: string,
  tickets: readonly T[],
  projectOf: (id: string) => Project | undefined,
  except: readonly string[] = [],
): T[] {
  return tickets
    .filter(t => !except.includes(t.id) && isCurrentFor(t, workroom, projectOf(t.project)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number - b.number)
}

// カレントチケットが終わったワークルーム workroom の次のカレントワーク: 担当で作業中のレーンにあるチケット（except を除く）が 1 枚ならそれ、
// 0 枚か 2 枚以上なら none（2 枚以上なら、どれにするかを利用者に聞くよう常駐メッセージが知らせる。notices.ts）
export function nextWorkOf(
  workroom: string,
  tickets: readonly (TicketLike & { id: string })[],
  projectOf: (id: string) => Project | undefined,
  except: readonly string[] = [],
): string {
  const left = workingTicketsOf(workroom, tickets, projectOf, except)
  return left.length === 1 && left[0] ? left[0].id : NO_TICKET
}

// チケット ticket の番号の見せ方（プロジェクトが読めなければプレフィクス無し）と名前（AI に見せる文の中）
export const ticketText = (ticket: TicketLike & { id: string; name: string }, project: Project | undefined) =>
  `${ticketLabel(project?.prefix ?? "", ticket.number)} "${ticket.name}" (${ticket.id})`

// カレントチケットの無いワークルーム workroom の AI に、担当で作業中のレーンにあるチケット（except を除く）を並べ、どれにするかを利用者に聞くように言う文（無ければ空）。
// 常駐メッセージ（notices.ts）と、参加の文・作業机（workroomWork の forAi）に出す
export function waitingLineOf(
  workroom: string,
  tickets: readonly (TicketLike & { id: string; name: string })[],
  projectOf: (id: string) => Project | undefined,
  except: readonly string[] = [],
): string {
  const waiting = workingTicketsOf(workroom, tickets, projectOf, except)
  if (waiting.length === 0) return ""
  const list = waiting.map(t => ticketText(t, projectOf(t.project))).join(", ")
  return `These tickets assigned to your workroom are in working lanes: ${list}. Ask the user which one to work on, and start it with ticket-start.`
}

// 読んだ物（READS_ASSIGNED_TICKETS と READS_PROJECTS）の、チケットの並びとプロジェクトの引き方
export function openTicketsIn(records: ActionContext["records"]): {
  tickets: Ticket[]
  projectOf: (id: string) => Project | undefined
} {
  const tickets = Object.values(records?.[TICKET.id] ?? {}).flatMap(r => {
    const t = TICKET.record.safeParse(r)
    return t.success ? [t.data] : []
  })
  const projects = records?.[PROJECT.id] ?? {}
  return { tickets, projectOf: id => parsed(PROJECT.record, projects[id]) }
}

// ワークルーム workroom のカレントワークを ticket（チケットの id か none）にする、others の 1 件
export const currentWorkSet = (workroom: string, ticket: string) => ({
  subject: CURRENT_WORK_ID,
  id: workroom,
  record: { id: workroom, ticket },
})

// プロジェクトが before から after に変わったとき（レーンの作業中の印を付けた・外した、レーンを消した）の、カレントワークの直し（others）。
// tickets はそのプロジェクトのチケット、works は読んだカレントワーク、open は担当のいるチケット全部とプロジェクトの引き方（openTicketsIn）。
// - このプロジェクトのチケットを指すカレントワークのうち、カレントチケットでなくなった物を、nextWorkOf で選び直す
//   （担当で作業中のレーンにある物が 1 枚ならそれ、0 枚か 2 枚以上なら none）
// - このプロジェクトのチケットが新しくカレントチケットになれたワークルームで、カレントワークが none（になった物も含む）の物は、
//   そのチケットにする（更新の新しい順で先の 1 枚。チケットが担当に入る・作業中のレーンに入るときと同じ）
export function currentWorkOnLanes(
  before: Project,
  after: Project,
  tickets: readonly (TicketLike & { id: string })[],
  works: readonly { id: string; ticket: string }[],
  open: { tickets: readonly (TicketLike & { id: string })[]; projectOf: (id: string) => Project | undefined },
): ReturnType<typeof currentWorkSet>[] {
  const byId = new Map(tickets.map(t => [t.id, t]))
  const now = new Map(works.map(w => [w.id, w.ticket]))
  const was = new Map(now)
  for (const w of works) {
    const t = byId.get(w.ticket)
    if (t && !isCurrentFor(t, w.id, after)) now.set(w.id, nextWorkOf(w.id, open.tickets, open.projectOf))
  }
  const newest = [...tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number - b.number)
  for (const t of newest)
    for (const room of t.assignees) {
      if (!isCurrentFor(t, room, after) || isCurrentFor(t, room, before)) continue
      if ((now.get(room) ?? NO_TICKET) !== NO_TICKET) continue
      now.set(room, t.id)
    }
  return [...now].flatMap(([room, ticket]) =>
    (was.get(room) ?? NO_TICKET) === ticket ? [] : [currentWorkSet(room, ticket)],
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
    "The current work of a workroom (the record's id is the workroom's id): ticket is the ticket the workroom is working on now, or none. Its current ticket is that ticket while the workroom is one of its assignees and it is in a working lane of its project. It is filled when a ticket that a workroom with no current work is assigned to comes into a working lane (or the workroom is assigned to a ticket in a working lane), changed with ticket-start. When the current ticket ends (ticket-leave, the ticket is completed or removed, or leaves the working lanes, also when the working mark of its lane is taken off, or the workroom's assignment), the only other ticket assigned to the workroom in working lanes becomes its current ticket; with none or several, it is none (with several, the workroom's AI is told them, and asks the user which one to start with ticket-start). When a lane gets the working mark, a workroom with no current work that is assigned to a ticket in that lane gets that ticket (the most recently updated one).",
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
    if (current) return { kind: "working", key: { subject: TICKET.id, id: current.ticket.id } }
    // 空きでも、担当で作業中のレーンにあるチケットが残っていれば、それを AI に知らせる
    const tickets = read.find(TICKET.id, ASSIGNED).flatMap(r => {
      const t = parsed(TICKET.record, r)
      return t ? [t] : []
    })
    const forAi = waitingLineOf(workroom, tickets, id => parsed(PROJECT.record, read.record(PROJECT.id, id)))
    return forAi ? { kind: "idle", forAi } : { kind: "idle" }
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
// project はチケットのプロジェクト、works は読んだカレントワーク、open は担当のいるチケット全部とプロジェクトの引き方（openTicketsIn。カレントチケットでなくなり得る変わりのときだけ読む）。
// - そのチケットを指すカレントワークのうち、カレントチケットでなくなったワークルームの物を、nextWorkOf で選び直す（このチケットを除いて、
//   担当で作業中のレーンにある物が 1 枚ならそれ、0 枚か 2 枚以上なら none）
// - 新しくカレントチケットになれたワークルーム（担当に入った・作業中のレーンに入った）で、カレントワークが none の物は、このチケットにする。
//   ほかのチケットを指したまま古くなったカレントワーク（そのレーンの作業中の印を外したなど）は、ここでは埋めない（そのチケットを読まないため）
export function currentWorkChanges(
  before: Ticket | "none",
  after: Ticket | "removed",
  project: Project | undefined,
  works: readonly CurrentWork[],
  open?: { tickets: readonly (TicketLike & { id: string })[]; projectOf: (id: string) => Project | undefined },
): ReturnType<typeof currentWorkSet>[] {
  const id = before === "none" ? (after === "removed" ? undefined : after.id) : before.id
  if (id === undefined) return []
  const can = (t: Ticket | "none" | "removed", w: string) =>
    t !== "none" && t !== "removed" && isCurrentFor(t, w, project)
  const byRoom = new Map(works.map(w => [w.id, w]))
  const emptied = works
    .filter(w => w.ticket === id && !can(after, w.id))
    .map(w => currentWorkSet(w.id, open ? nextWorkOf(w.id, open.tickets, open.projectOf, [id]) : NO_TICKET))
  const filled =
    after === "removed"
      ? []
      : after.assignees
          .filter(w => can(after, w) && !can(before, w))
          .filter(w => (byRoom.get(w)?.ticket ?? NO_TICKET) === NO_TICKET)
          .map(w => currentWorkSet(w, id))
  return [...emptied, ...filled]
}
