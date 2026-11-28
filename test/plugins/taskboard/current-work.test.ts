// カレントワーク: チケットのアクションが同じトランザクションで直す・ticket-start で取り替える・ticket-leave で抜ける。
// 見せる側の判定（currentTicketOf・作業の様子）は、古くなったカレントワークを外す
import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import type { CoreCatalog } from "../../../web/src/core/core-catalog"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { readerOf, sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { workroomActivityOf, workroomWorkIn, workroomWorkOf } from "../../../web/src/plugins/base/participant/activity"
import { myWorkdeskIn } from "../../../web/src/plugins/base/participant/my-workdesk"
import { handoffDueIn } from "../../../web/src/plugins/base/participant/refresh-request"
import { workTitleIn } from "../../../web/src/plugins/base/participant/work-title"
import { workerBookOf, workerBookReadsOf } from "../../../web/src/plugins/base/participant/worker-book"
import { WORKROOM } from "../../../web/src/plugins/base/participant/workroom"
import { CURRENT_WORK, currentTicketOf } from "../../../web/src/plugins/taskboard/current-work"
import { nextWorkOf, workingTicketsOf } from "../../../web/src/plugins/taskboard/current-work/work"
import type { Project } from "../../../web/src/plugins/taskboard/project"
import { TICKET, type Ticket } from "../../../web/src/plugins/taskboard/ticket"
import { CORE_CATALOG } from "../../support"

const A = (id: string) => `@matomezu/taskboard:${id}`
type Done = { ok: boolean; reason?: string; detail?: string; result?: Record<string, unknown> }
type On = { record: string }
const ai = (workroom: string): Actor => ({ kind: "ai", workroom: { id: workroom } })

function board() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (actor: Actor, action: string, args: unknown, on?: On) => {
    const done = performIn(w, action.includes(":") ? action : A(action), args, on, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "ja",
      newId: () => `n${++n}`,
      now: "2026-11-21T00:00:00.000Z",
      today: "2026-11-21",
      actor,
    }) as PerformedIn
    if (done.ok)
      w = {
        ...w,
        ...(done.records ? { records: withRecords(w.records, done.records) } : {}),
        counters: withCounters(w.counters, done.counters),
      }
    return done as unknown as Done
  }
  const user = (action: string, args: unknown, on?: On) => act(USER, action, args, on)
  const room = (name: string) =>
    (user("@matomezu/base:workroom-add", { name, bird: "inko" }) as Done & { result: { workroom: string } }).result
      .workroom
  user("project-add", {})
  const projectRecord = () => Object.values(w.records[A("project")] ?? {})[0] as Project
  const project = projectRecord().id
  const lane = (working: boolean) =>
    projectRecord().lanes.flatMap(l =>
      l.kind === "lane" && (l.working === true) === working && l.id !== projectRecord().doneLane ? [l.id] : [],
    )[0] as string
  const doing = lane(true)
  const todo = lane(false)
  const add = (args: Record<string, unknown> = {}) =>
    (user("ticket-add", { project, name: "t", ...args }) as Done & { result: { ticket: string } }).result.ticket
  // ワークルーム room のカレントワークが指すチケット（レコードが無ければ none）
  const work = (room: string) =>
    (w.records[CURRENT_WORK.id]?.[room] as { ticket: string } | undefined)?.ticket ?? "none"
  const ticketRecord = (id: string) => w.records[TICKET.id]?.[id] as Ticket
  return { act, user, room, project, doing, todo, add, work, ticketRecord, world: () => w }
}

test("カレントワークが none のワークルームは、作業中のレーンのチケットの担当に入ると、そのチケットがカレントワークになる。レーンから出ると none", () => {
  const { user, room, doing, todo, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  expect(work(a)).toBe(t1)
  user("ticket-update", { lane: todo }, { record: t1 })
  expect(work(a)).toBe("none")
  // 作業中のレーンへ戻すと、また入る
  user("ticket-update", { lane: doing }, { record: t1 })
  expect(work(a)).toBe(t1)
  // 担当から外すと none
  user("ticket-update", { assignees: [] }, { record: t1 })
  expect(work(a)).toBe("none")
})

test("カレントワークのあるワークルームを、ほかのチケットに当てても入れ替わらない（当てられているだけ）", () => {
  const { user, room, doing, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: doing })
  user("ticket-update", { assignees: [a] }, { record: t2 })
  expect(work(a)).toBe(t1)
})

test("レーンを指さずに担当を新しく付けると、作業中のレーン（並びで最初）へ移り、カレントワークが none の担当のカレントチケットになる。カレントワークのある担当は入れ替わらない", () => {
  const { user, room, doing, todo, add, work, ticketRecord } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ assignees: [a] })
  expect(ticketRecord(t1).lane).toBe(doing)
  expect(work(a)).toBe(t1)
  const t2 = add({ lane: todo })
  user("ticket-update", { assignees: [b, a] }, { record: t2 })
  expect(ticketRecord(t2).lane).toBe(doing)
  expect([work(a), work(b)]).toEqual([t1, t2])
  // レーンを指して付ければ移らない（予定として担当だけ付ける）
  const t3 = add({ lane: todo, assignees: [b] })
  expect(ticketRecord(t3).lane).toBe(todo)
  const t4 = add({ lane: todo })
  user("ticket-update", { lane: todo, assignees: [a] }, { record: t4 })
  expect(ticketRecord(t4).lane).toBe(todo)
  // 担当を外すだけ・並べ替えるだけでは移らない
  user("ticket-update", { assignees: [] }, { record: t4 })
  const t5 = add({ lane: todo })
  user("ticket-update", { lane: todo, assignees: [a, b] }, { record: t5 })
  user("ticket-update", { assignees: [b, a] }, { record: t5 })
  expect(ticketRecord(t5).lane).toBe(todo)
})

test("作業中のレーンが無いプロジェクトでは、担当を付けても移らない", () => {
  const { user, room, project, todo, add, work, ticketRecord, world } = board()
  const a = room("あ")
  const p = world().records[A("project")]?.[project] as Project
  user(
    "project-update",
    { lanes: p.lanes.map(l => (l.kind === "lane" ? { ...l, working: undefined } : l)) },
    { record: project },
  )
  const t1 = add({ assignees: [a] })
  expect(ticketRecord(t1).lane).toBe("unsorted")
  const t2 = add({ lane: todo })
  user("ticket-update", { assignees: [a] }, { record: t2 })
  expect(ticketRecord(t2).lane).toBe(todo)
  expect(work(a)).toBe("none")
})

test("ticket-start は取り替える: 作業中のレーンへ移し、担当に足し、前のチケットは当てられているだけに戻る", () => {
  const { act, room, doing, todo, add, work, ticketRecord } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: todo })
  const done = act(ai(a), "ticket-start", {}, { record: t2 })
  expect(done).toMatchObject({ ok: true, result: { workroom: a, previous: t1, lane: doing } })
  expect(work(a)).toBe(t2)
  expect(ticketRecord(t2)).toMatchObject({ lane: doing, assignees: [a] })
  expect(ticketRecord(t1).assignees).toEqual([a])
  // 同じチケットをもう一度始めても変わらない
  expect(act(ai(a), "ticket-start", {}, { record: t2 })).toMatchObject({ ok: true, result: { previous: t2 } })
})

test("ticket-start で作業中のレーンへ移ると、カレントワークが none のほかの担当にも入る", () => {
  const { act, room, todo, add, work } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: todo, assignees: [b] })
  expect(work(b)).toBe("none")
  act(ai(a), "ticket-start", {}, { record: t1 })
  expect(work(a)).toBe(t1)
  expect(work(b)).toBe(t1)
})

test("ticket-start: AI は workroom を渡せない。利用者は workroom を名前でも選べ、無ければ断る", () => {
  const { act, user, room, add, work } = board()
  const a = room("あ")
  const t1 = add()
  expect(act(ai(a), "ticket-start", { workroom: a }, { record: t1 }).ok).toBe(false)
  expect(user("ticket-start", {}, { record: t1 }).ok).toBe(false)
  expect(user("ticket-start", { workroom: "あ" }, { record: t1 }).ok).toBe(true)
  expect(work(a)).toBe(t1)
})

test("ticket-leave は抜ける: カレントワークを none に。unassign で担当からも外す。どちらでもなければ断る", () => {
  const { act, room, doing, add, work, ticketRecord } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: doing, assignees: [a, b] })
  expect(act(ai(b), "ticket-leave", {}, { record: t1 })).toMatchObject({
    ok: true,
    result: { left: true, unassigned: false },
  })
  expect(work(b)).toBe("none")
  expect(ticketRecord(t1).assignees).toEqual([a, b])
  // 抜けたあと、ほかの変更で勝手に戻らない
  act(ai(a), "ticket-update", { name: "u" }, { record: t1 })
  expect(work(b)).toBe("none")
  expect(act(ai(b), "ticket-leave", { unassign: true }, { record: t1 })).toMatchObject({
    ok: true,
    result: { left: false, unassigned: true },
  })
  expect(ticketRecord(t1).assignees).toEqual([a])
  expect(work(a)).toBe(t1)
  expect(act(ai(b), "ticket-leave", {}, { record: t1 }).ok).toBe(false)
})

test("完了・削除すると、そのチケットを指すカレントワークは全部 none（同じトランザクション）", () => {
  const { user, room, doing, add, work } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: doing, assignees: [a, b] })
  expect([work(a), work(b)]).toEqual([t1, t1])
  user("ticket-complete", {}, { record: t1 })
  expect([work(a), work(b)]).toEqual(["none", "none"])
  const t2 = add({ lane: doing, assignees: [a] })
  expect(work(a)).toBe(t2)
  user("ticket-remove", {}, { record: t2 })
  expect(work(a)).toBe("none")
})

test("見せる側の判定: 作業中の印を外したレーンのチケットを指すカレントワークは、カレントチケットにも作業中にもならない", () => {
  const { user, room, project, doing, add, world } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const records = () => world().records as Record<string, Record<string, unknown>>
  const current = () =>
    currentTicketOf(
      a,
      records()[CURRENT_WORK.id]?.[a] as { ticket: string } | undefined,
      id => records()[TICKET.id]?.[id] as Ticket | undefined,
      id => records()[A("project")]?.[id] as Project | undefined,
    )
  expect(current()?.ticket.id).toBe(t1)
  expect(workroomActivityOf(CORE_CATALOG, records(), a)).toBe("working")
  const p = records()[A("project")]?.[project] as Project
  user(
    "project-update",
    { lanes: p.lanes.map(l => (l.kind === "lane" ? { ...l, working: undefined } : l)) },
    { record: project },
  )
  expect(current()).toBeUndefined()
  expect(workroomActivityOf(CORE_CATALOG, records(), a)).toBe("idle")
})

test("ticket-start は、完了のチケットと、作業中のレーンが無いプロジェクトのチケットでは断る", () => {
  const { act, user, room, project, add, world } = board()
  const a = room("あ")
  const done = add()
  user("ticket-complete", {}, { record: done })
  expect(act(ai(a), "ticket-start", {}, { record: done }).ok).toBe(false)
  const p = world().records[A("project")]?.[project] as Project
  user(
    "project-update",
    { lanes: p.lanes.map(l => (l.kind === "lane" ? { ...l, working: undefined } : l)) },
    { record: project },
  )
  expect(act(ai(a), "ticket-start", {}, { record: add() }).ok).toBe(false)
})

test("今カレントにしているチケットに ticket-start をしても、何も書かない", () => {
  const { act, room, doing, add } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const again = act(ai(a), "ticket-start", {}, { record: t1 }) as Done & { records?: readonly unknown[] }
  expect(again.ok).toBe(true)
  expect(again.records ?? []).toEqual([])
})

test("ロックしたチケットでは ticket-start も ticket-leave も断る（チケットのアクションとして同じ扱い）", () => {
  const { act, user, room, doing, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  user("ticket-lock", {}, { record: t1 })
  expect(act(ai(a), "ticket-leave", {}, { record: t1 }).ok).toBe(false)
  expect(work(a)).toBe(t1)
  const t2 = add()
  user("ticket-lock", {}, { record: t2 })
  expect(act(ai(a), "ticket-start", {}, { record: t2 }).ok).toBe(false)
})

test("ロックの掛け外しには、カレントワークは応じない（古くなったカレントワークがそのチケットを指していても、ロックはチケットの locked だけを変える）", () => {
  const { room, todo, add, world } = board()
  const a = room("あ")
  const t1 = add({ lane: todo, assignees: [a] })
  // 作業中でないレーンのチケットを指す、古くなったカレントワーク
  const w = world()
  const stale: World = {
    ...w,
    records: { ...w.records, [CURRENT_WORK.id]: { ...(w.records[CURRENT_WORK.id] ?? {}), [a]: { id: a, ticket: t1 } } },
  }
  const done = performIn(
    stale,
    A("ticket-lock"),
    {},
    { record: t1 },
    {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "ja",
      newId: () => "z",
      now: "2026-11-21T00:00:00.000Z",
      today: "2026-11-21",
      actor: USER,
    },
  )
  expect(done.ok && done.records?.map(r => r.subject)).toEqual([TICKET.id])
})

test("レーンの作業中の印を外すと、そのレーンのチケットを指すカレントワークは none。付け直すと、none のワークルームにまた入る（同じトランザクション）", () => {
  const { user, room, project, doing, add, work, world } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: doing, assignees: [a] })
  const lanes = () => (world().records[A("project")]?.[project] as Project | undefined)?.lanes ?? []
  const marked = (on: boolean) =>
    lanes().map(l => (l.kind === "lane" && l.id === doing ? { ...l, working: on ? true : undefined } : l))
  expect(user("project-update", { lanes: marked(false) }, { record: project }).ok).toBe(true)
  expect(work(a)).toBe("none")
  // 印の無い間に担当に入っても埋まらない
  user("ticket-update", { assignees: [a, b] }, { record: t1 })
  expect(work(b)).toBe("none")
  expect(user("project-update", { lanes: marked(true) }, { record: project }).ok).toBe(true)
  expect([work(a), work(b)]).toEqual([t1, t1])
  // 完了のレーンを選ぶ確かめも、レーンを一緒に変えるときに効く（担当のいるチケットのレーンは断る）
  expect(user("project-update", { lanes: marked(false), doneLane: doing }, { record: project }).ok).toBe(false)
})

// 機能台帳 catalog でワーカーブックを引くのに読む種類だけを、records から読む読み口
const reader = (catalog: CoreCatalog, records: Record<string, Record<string, unknown>>) =>
  readerOf(catalog, sourceOf(records as Records), workerBookReadsOf(catalog))

test("ワークルームの作業: カレントチケットがあれば作業中で、レコードはチケット。無ければ空き。ワーカーブックは、作業中ならチケットの物（名前はチケットの番号）、ほかはワークルームの物", () => {
  const { act, room, add, world } = board()
  const a = room("あ")
  const records = () => world().records as Record<string, Record<string, unknown>>
  expect(workroomWorkOf(CORE_CATALOG, records(), a)).toEqual({ kind: "idle" })
  expect(workerBookOf(CORE_CATALOG, reader(CORE_CATALOG, records()), a)).toEqual({
    workKey: { subject: "@matomezu/base:workroom", id: a },
    title: "あ",
  })
  const t1 = add({ name: "鳥と表示名" })
  act(ai(a), "ticket-start", {}, { record: t1 })
  expect(workroomWorkOf(CORE_CATALOG, records(), a)).toEqual({
    kind: "working",
    key: { subject: "@matomezu/taskboard:ticket", id: t1 },
  })
  expect(workerBookOf(CORE_CATALOG, reader(CORE_CATALOG, records()), a)).toEqual({
    workKey: { subject: "@matomezu/taskboard:ticket", id: t1 },
    title: "T-0001",
  })
  const none = { ...CORE_CATALOG, subjects: new Map() } as CoreCatalog
  expect(workerBookOf(none, reader(none, records()), a).workKey).toEqual({
    subject: "@matomezu/base:workroom",
    id: a,
  })
})

test("作業名: 作業中なら題名とワークルームの名前、空きなら空きの印、答える種類が無ければ名前だけ、設定が止めていれば off", () => {
  const { act, room, add, world } = board()
  const a = room("ひよこ")
  const source = () => sourceOf(world().records as Records)
  const ja = { "@matomezu/base:lang": "matomezu:ja" }
  const title = (catalog: CoreCatalog, settings: Record<string, unknown>) =>
    workTitleIn(catalog, settings, source(), { id: a, name: "ひよこ" })
  expect(title(CORE_CATALOG, ja)).toEqual({ kind: "title", title: "ひよこ（空き）" })
  expect(title(CORE_CATALOG, {})).toEqual({ kind: "title", title: "ひよこ (idle)" })
  act(ai(a), "ticket-start", {}, { record: add({ name: "鳥と表示名" }) })
  expect(title(CORE_CATALOG, ja)).toEqual({ kind: "title", title: "T-0001 鳥と表示名 ひよこ" })
  const noAnswer = { ...CORE_CATALOG, subjects: new Map() } as CoreCatalog
  expect(title(noAnswer, ja)).toEqual({ kind: "title", title: "ひよこ" })
  expect(title(CORE_CATALOG, { ...ja, "@matomezu/base:session-rename": false })).toEqual({ kind: "off" })
})

test("今の作業が替わると、同じ書き込みでワークルームのレコードに今の作業と離れた作業を写し、その AI に 1 通だけ知らせる（誰が替えても）", () => {
  const { act, user, room, doing, add, world } = board()
  const a = room("ひよこ")
  const roomRecord = () => world().records[WORKROOM.id]?.[a] as { work?: unknown; handoffTarget?: unknown }
  const texts = (d: Done) =>
    ((d as Done & { hostMessages?: { workroom: string; text: string }[] }).hostMessages ?? [])
      .filter(m => m.workroom === a)
      .map(m => m.text)
  // 利用者が振った: 空きから作業へ。離れた作業は無いので、会話を空にする頼み方は添えない
  const t1 = add({ name: "一", lane: doing, assignees: [a] })
  expect(roomRecord().work).toEqual({ subject: TICKET.id, id: t1 })
  expect(roomRecord().handoffTarget).toBeUndefined()
  // 替わらない書き込みでは知らせない
  expect(texts(user("ticket-update", { name: "一の二" }, { record: t1 }))).toEqual([])
  // AI 自身が替えた: 知らせは行った AI にも届き（常駐が答えの notice で渡す）、離れた作業を覚える
  const t2 = add({ name: "二", lane: doing, assignees: [a] })
  const [changed] = texts(act(ai(a), "ticket-start", {}, { record: t2 }))
  expect(changed).toContain("Your current work changed from T-0001")
  expect(changed).toContain(`read_records with kind "${TICKET.id}" and id "${t2}"`)
  expect(changed).toContain("@matomezu/base:refresh-request")
  expect(roomRecord()).toMatchObject({ work: { id: t2 }, handoffTarget: { id: t1 } })
  // 担当で作業中の物が残っていれば、それが次の作業になる
  expect(texts(user("ticket-complete", {}, { record: t2 }))[0]).toContain("changed from T-0002")
  // 終わって空きになった: 今の作業は消え、離れた作業は終わった物
  const [ended] = texts(user("ticket-complete", {}, { record: t1 }))
  expect(ended).toContain("no current work")
  expect(ended).toContain('read_folder with folder "my-workdesk"')
  expect(roomRecord().work).toBeUndefined()
  expect(roomRecord().handoffTarget).toEqual({ subject: TICKET.id, id: t1 })
})

test("今の作業が替わると、管理者のワークルームにも、替わったワークルームの全部を 1 通にまとめて知らせる。管理者のワークルームの替わりは載せない。完了の知らせはこれだけ", () => {
  const { act, user, room, doing, add } = board()
  const admin = room("管理")
  const a = room("あ")
  const b = room("い")
  user("@matomezu/base:admin-set", { workroom: admin })
  const toAdmin = (d: Done) =>
    ((d as Done & { hostMessages?: { workroom: string; text: string }[] }).hostMessages ?? [])
      .filter(m => m.workroom === admin && m.text.startsWith("The current work of workrooms"))
      .map(m => m.text)
  const t1 = add({ name: "一", lane: doing, assignees: [a, b] })
  // 2 つのワークルームが同じ書き込みで替わる: 1 通。閉じたときの知らせはこれだけ
  const done = act(ai(b), "ticket-complete", {}, { record: t1 }) as Done & { payloads?: unknown }
  expect(done.payloads).toBeUndefined()
  expect(toAdmin(done)).toEqual([
    "The current work of workrooms changed: あ: T-0001 一 ended, no current work now. い: T-0001 一 ended, no current work now.",
  ])
  const t2 = add({ name: "二", lane: doing, assignees: [a] })
  const t3 = add({ name: "三" })
  expect(toAdmin(act(ai(a), "ticket-start", {}, { record: t3 }))).toEqual([
    "The current work of workrooms changed: あ: from T-0002 二 to T-0003 三.",
  ])
  // 管理者のワークルームだけが替わったときは送らない
  expect(toAdmin(act(ai(admin), "ticket-start", {}, { record: t2 }))).toEqual([])
  // 管理者がいなければ送らない
  user("@matomezu/base:admin-set", { workroom: "none" }, { record: "admin" })
  const none = user("ticket-complete", {}, { record: t3 }) as Done & { hostMessages?: { workroom: string }[] }
  expect(none.hostMessages?.map(m => m.workroom)).toEqual([a])
})

test("引継ぎページの頼み: 引継ぎ対象チケットがあり、そのレコードが在れば refresh-request を頼む文。無い・レコードが消えたなら空", () => {
  const { act, user, room, doing, add, world } = board()
  const a = room("ひよこ")
  const due = () => handoffDueIn(CORE_CATALOG, sourceOf(world().records as Records), a)
  const t1 = add({ name: "一", lane: doing, assignees: [a] })
  expect(due()).toBe("")
  act(ai(a), "ticket-start", {}, { record: add({ name: "二" }) })
  expect(due()).toContain("You left T-0001 一")
  expect(due()).toContain("@matomezu/base:refresh-request")
  user("ticket-remove", {}, { record: t1 })
  expect(due()).toBe("")
})

test("ワークルームの作業は、答える種類のうち機能台帳の並びで最初に作業中と答えた物。どれも作業中でなければ空き", () => {
  const answer = (work: { kind: "working"; title: string } | { kind: "idle" }) => ({
    workroomWork: () => (work.kind === "working" ? { kind: "working", key: { subject: "s", id: work.title } } : work),
  })
  const catalog = (...subjects: object[]) =>
    ({ ...CORE_CATALOG, subjects: new Map(subjects.map((s, i) => [`s${i}`, s])) }) as unknown as CoreCatalog
  const source = readerOf(CORE_CATALOG, sourceOf({} as Records), [])
  expect(
    workroomWorkIn(
      catalog(
        answer({ kind: "idle" }),
        answer({ kind: "working", title: "先" }),
        answer({ kind: "working", title: "後" }),
      ),
      source,
      "w",
    ),
  ).toEqual({ kind: "working", key: { subject: "s", id: "先" } })
  expect(workroomWorkIn(catalog(answer({ kind: "idle" }), {}), source, "w")).toEqual({ kind: "idle" })
  expect(workroomWorkIn(catalog({}), source, "w")).toBe("unknown")
})

test("ワークルームの作業を答える種類は、workroomWorkReads に書いた種類だけを読める（ほかは none と空）", () => {
  const seen: unknown[] = []
  const catalog = {
    ...CORE_CATALOG,
    subjects: new Map([
      [
        "s",
        {
          workroomWorkReads: ["a"],
          workroomWork: (
            w: string,
            read: { record(s: string, id: string): unknown; find(s: string, where: []): readonly unknown[] },
          ) => {
            seen.push(read.record("a", w), read.record("b", w), read.find("b", []))
            return { kind: "idle" }
          },
        },
      ],
    ]),
  } as unknown as CoreCatalog
  const records = { a: { w: { id: "w" } }, b: { w: { id: "w" } } } as unknown as Records
  workroomWorkIn(catalog, readerOf(catalog, sourceOf(records), ["a", "b"]), "w")
  expect(seen).toEqual([{ id: "w" }, "none", []])
})

test("次に選ぶ物: 担当で作業中のレーンにあるチケット（除く物のほか）。更新の新しい順、次に番号。1 枚ならそれ、0 枚か 2 枚以上なら none", () => {
  const p = {
    id: "p",
    lanes: [
      { kind: "lane", id: "doing", working: true },
      { kind: "lane", id: "todo" },
    ],
  } as never
  const projectOf = (id: string) => (id === "p" ? p : undefined)
  const t = (id: string, number: number, lane: string, assignees: string[], updatedAt = "2026-11-21") => ({
    id,
    number,
    lane,
    assignees,
    project: "p",
    updatedAt,
  })
  const tickets = [
    t("t1", 1, "doing", ["a"]),
    t("t2", 2, "doing", ["b", "a"], "2026-11-22"),
    t("t3", 3, "todo", ["a"]), // 作業中のレーンでない
    t("t4", 4, "doing", ["b"]), // 担当でない
    { ...t("t5", 5, "doing", ["a"]), project: "gone" }, // プロジェクトが無い
    t("t6", 6, "doing", ["a"]),
  ]
  expect(workingTicketsOf("a", tickets, projectOf).map(x => x.id)).toEqual(["t2", "t1", "t6"])
  expect(nextWorkOf("a", tickets, projectOf)).toBe("none")
  expect(nextWorkOf("a", tickets, projectOf, ["t2", "t6"])).toBe("t1")
  expect(nextWorkOf("a", tickets, projectOf, ["t1", "t2", "t6"])).toBe("none")
  // 消したワークルームの id が担当に残っていても、ほかのワークルームの選びに入らない
  expect(nextWorkOf("gone-room", tickets, projectOf)).toBe("none")
})

test("カレントチケットが終わると、担当で作業中のレーンに残る物が 1 枚ならそれがカレントに、2 枚以上なら none（完了）", () => {
  const { user, act, room, doing, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: doing, assignees: [a] })
  expect(work(a)).toBe(t1)
  user("ticket-complete", {}, { record: t1 })
  expect(work(a)).toBe(t2)
  const t3 = add({ lane: doing, assignees: [a] })
  const t4 = add({ lane: doing, assignees: [a] })
  act(ai(a), "ticket-start", {}, { record: t3 })
  user("ticket-complete", {}, { record: t3 })
  expect(work(a)).toBe("none")
  // 選ばれなかった物は担当のまま。ticket-start で始められる
  expect(act(ai(a), "ticket-start", {}, { record: t4 }).ok).toBe(true)
  expect(work(a)).toBe(t4)
})

test("カレントチケットの担当から外れる・作業中のレーンを出る・消すと、残る 1 枚がカレントになる", () => {
  const { user, room, doing, todo, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: doing, assignees: [a] })
  user("ticket-update", { assignees: [] }, { record: t1 })
  expect(work(a)).toBe(t2)
  user("ticket-update", { assignees: [a] }, { record: t1 })
  user("ticket-update", { lane: todo }, { record: t2 })
  expect(work(a)).toBe(t1)
  user("ticket-update", { lane: doing }, { record: t2 })
  user("ticket-remove", {}, { record: t1 })
  expect(work(a)).toBe(t2)
})

test("ticket-leave は、抜けた物を除いて残る 1 枚をカレントにし、結果で返す。2 枚以上なら none と、その並び（waiting）", () => {
  const { act, room, doing, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: doing, assignees: [a] })
  expect(act(ai(a), "ticket-leave", {}, { record: t1 })).toMatchObject({
    ok: true,
    result: { left: true, current: t2 },
  })
  expect(work(a)).toBe(t2)
  const t3 = add({ lane: doing, assignees: [a] })
  const left = act(ai(a), "ticket-leave", {}, { record: t2 })
  expect(left).toMatchObject({ ok: true, result: { left: true, current: "none", waiting: [t1, t3] } })
  expect(work(a)).toBe("none")
})

test("作業中の印を外すと、ほかのレーンで担当の作業中の物が 1 枚ならそれがカレントになる", () => {
  const { user, room, project, doing, todo, add, work, world } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: todo, assignees: [a] })
  const lanes = () => (world().records[A("project")]?.[project] as Project | undefined)?.lanes ?? []
  const marked = (id: string, on: boolean) =>
    lanes().map(l => (l.kind === "lane" && l.id === id ? { ...l, working: on ? true : undefined } : l))
  expect(user("project-update", { lanes: marked(todo, true) }, { record: project }).ok).toBe(true)
  expect(work(a)).toBe(t1)
  expect(user("project-update", { lanes: marked(doing, false) }, { record: project }).ok).toBe(true)
  expect(work(a)).toBe(t2)
})

test("空きのワークルームに担当で作業中の物が残っていれば、AI の作業机の文（参加の文・read_folder）がそれを並べる。作業中のワークルームには並べない", () => {
  const { act, room, doing, add, world } = board()
  const a = room("あ")
  const b = room("い")
  const records = () => world().records as Records
  const t1 = add({ lane: doing, assignees: [a] })
  add({ lane: doing, assignees: [a] })
  add({ lane: doing, assignees: [a] })
  add({ lane: doing, assignees: [b] })
  act(ai(a), "ticket-leave", { unassign: true }, { record: t1 })
  const desk = (r: string) => myWorkdeskIn(CORE_CATALOG, sourceOf(records()), {}, r).forAi
  expect(workroomWorkOf(CORE_CATALOG, records(), a)).toEqual({ kind: "idle" })
  expect(desk(a)).toContain("Ask the user which one")
  expect(workroomWorkOf(CORE_CATALOG, records(), b)).toMatchObject({ kind: "working" })
  expect(desk(b)).not.toContain("Ask the user which one")
})

test("ワークルームの作業を答えるとき、空きのワークルームでも担当のチケットを探さない（AI に添える文は aiWorkroomIdle が作る）", () => {
  const { act, room, doing, add, world } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  add({ lane: doing, assignees: [a] })
  add({ lane: doing, assignees: [a] })
  act(ai(a), "ticket-leave", { unassign: true }, { record: t1 })
  const read = readerOf(CORE_CATALOG, sourceOf(world().records as Records), workerBookReadsOf(CORE_CATALOG))
  const found: string[] = []
  const counted = {
    ...read,
    find: (subject: string, where: Parameters<typeof read.find>[1]) => {
      found.push(subject)
      return read.find(subject, where)
    },
  }
  expect(workroomWorkIn(CORE_CATALOG, counted, a)).toEqual({ kind: "idle" })
  expect(found).not.toContain(TICKET.id)
})
