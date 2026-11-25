// 参加者・ワークルーム・管理者の印（base の対象の定義。レコード）: 要求は AI も行え、受け入れる・外す・ワークルームを作る・消すは利用者だけ。
// ワークルームの名前は重ならず、ワークルームに入る参加者は 1 人で、人のいるワークルームは消せない。要求は受け入れ・断り・キャンセルで終わる

import { expect, test } from "bun:test"
import { z } from "zod"
import { AI, USER } from "../../../web/src/core/actor"
import { checkCoreCatalog } from "../../../web/src/core/core-catalog-check"
import { joinActions } from "../../../web/src/core/participant"
import { performIn } from "../../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { PARTICIPANT_CANCEL } from "../../../web/src/plugins/base/participant"
import { BUILTIN_PARTS, CORE_CATALOG, newStore } from "../../support"

const PARTICIPANT = "@matomezu/base:participant"
const WORKROOM = "@matomezu/base:workroom"
const REQUEST = "@matomezu/base:participant-request"
const REJOIN = "@matomezu/base:participant-rejoin"
const ACCEPT = "@matomezu/base:participant-accept"
const DECLINE = "@matomezu/base:participant-decline"
const REMOVE = "@matomezu/base:participant-remove"
const ROOM_ADD = "@matomezu/base:workroom-add"
const ROOM_UPDATE = "@matomezu/base:workroom-update"
const ROOM_REMOVE = "@matomezu/base:workroom-remove"
const ADMIN_SET = "@matomezu/base:admin-set"
const CANCEL = PARTICIPANT_CANCEL.id

const WHO = { ai: "claude", model: "opus", env: "wsl", sessionName: "D92", link: "L1" }

type Done = { ok: boolean; reason?: string; result?: unknown }

function ready() {
  const store = newStore()
  const table = (kind: string) => store.state.getState().records[kind] ?? {}
  const people = () =>
    Object.values(table(PARTICIPANT)) as { id: string; state: string; workroom?: string; wantedName?: string }[]
  const rooms = () => Object.values(table(WORKROOM)) as { id: string; name: string; bird: string; palette?: string }[]
  const perform = store.actions.perform as unknown as (id: string, args: unknown, on?: { record: string }) => Done
  const request = (args: object = WHO) => perform(REQUEST, args) as Done & { result: { participant: string } }
  const addRoom = (name: string, bird = "inko") =>
    perform(ROOM_ADD, { name, bird }) as Done & { result: { workroom: string } }
  return { store, people, rooms, perform, request, addRoom }
}

test("要求すると、受け入れていない参加者のレコードが足され、id を返す。同じ link の要求と、同じ link の別の AI は断る", () => {
  const { people, request, perform } = ready()
  const done = request({ ...WHO, wantedName: "引き継ぎ" })
  expect(done.ok).toBe(true)
  expect(people()).toEqual([
    {
      id: done.result.participant,
      state: "requested",
      ai: "claude",
      model: "opus",
      env: "wsl",
      sessionName: "D92",
      link: "L1",
      wantedName: "引き継ぎ",
      requestedAt: expect.any(String),
    } as never,
  ])
  expect(perform(REQUEST, WHO).ok).toBe(false)
  expect(people()).toHaveLength(1)
})

test("ワークルームの名前は 20 字まで（要求の希望も、ワークルームを作るときも。21 字は断り、20 字は通す）", () => {
  const { request, addRoom, perform } = ready()
  expect(request({ ...WHO, wantedName: "あ".repeat(21) }).ok).toBe(false)
  expect(request({ ...WHO, wantedName: "あ".repeat(20) }).ok).toBe(true)
  expect(perform(ROOM_ADD, { name: "い".repeat(21), bird: "inko" }).ok).toBe(false)
  expect(addRoom("い".repeat(20)).ok).toBe(true)
})

test("受け入れると、ワークルームを指して受け入れた時点を書く（希望の名前は外す）。2 回目の受け入れと、人のいるワークルーム・無いワークルームへの受け入れは断る", () => {
  const { people, request, addRoom, perform } = ready()
  const first = request({ ...WHO, wantedName: "希望" }).result.participant
  const room = addRoom("A").result.workroom
  expect(perform(ACCEPT, { workroom: "nope" }, { record: first }).ok).toBe(false)
  expect(perform(ACCEPT, { workroom: room }, { record: first }).ok).toBe(true)
  const joined = people().find(p => p.id === first)
  expect(joined).toMatchObject({ state: "joined", workroom: room, joinedAt: expect.any(String) })
  expect(joined?.wantedName).toBeUndefined()
  expect(perform(ACCEPT, { workroom: room }, { record: first }).ok).toBe(false)
  const second = request({ ...WHO, link: "L2" }).result.participant
  expect(perform(ACCEPT, { workroom: room }, { record: second }).ok).toBe(false)
})

test("AI は要求できるが、受け入れる・断る・キャンセルする・外す・ワークルームを作る・消す・管理者を決めるはできない（利用者だけ）", () => {
  const { store, request, addRoom } = ready()
  const id = request().result.participant
  const room = addRoom("A").result.workroom
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER as never,
    lang: "en" as const,
    newId: () => `n${Math.random()}`,
    now: "2026-11-08T00:00:00.000Z",
    today: "2026-11-08",
  }
  const world = (s = store.state.getState()) => ({
    pages: {},
    folders: {},
    settings: s.settings,
    annotations: {},
    records: s.records,
    counters: s.counters,
  })
  const ai = (action: string, args: unknown, on?: { record: string }) =>
    performIn(world(), action, args, on, { ...ctx, actor: AI })
  const user = (action: string, args: unknown, on?: { record: string }) =>
    performIn(world(), action, args, on, { ...ctx, actor: USER })
  expect(ai(REQUEST, { ...WHO, link: "L9" }).ok).toBe(true)
  for (const [action, args, on] of [
    [ACCEPT, { workroom: room }, { record: id }],
    [DECLINE, {}, { record: id }],
    [CANCEL, {}, { record: id }],
    [REMOVE, {}, { record: id }],
    [ROOM_ADD, { name: "B", bird: "inko" }, undefined],
    [ROOM_REMOVE, {}, { record: room }],
    [ADMIN_SET, { workroom: room }, undefined],
  ] as const)
    expect(ai(action, args, on)).toMatchObject({ ok: false, reason: "not-allowed" })
  expect(user(ADMIN_SET, { workroom: room }).ok).toBe(true)
})

test("同じ入力（時刻と id のもと）なら同じ結果", () => {
  const run = () => {
    const { store } = ready()
    const s = store.state.getState()
    return performIn(
      { pages: {}, folders: {}, settings: s.settings, annotations: {}, records: s.records, counters: s.counters },
      REQUEST,
      WHO,
      undefined,
      {
        catalog: CORE_CATALOG,
        controlCenter: BUILTIN_CONTROL_CENTER as never,
        lang: "en",
        newId: () => "0123456789abcdef",
        now: "2026-11-08T00:00:00.000Z",
        today: "2026-11-08",
        actor: USER,
      },
    )
  }
  expect(run()).toEqual(run())
})

test("受け入れていない要求は 100 件まで。超えたら要求を断る（受け入れ済みは数えない）", () => {
  const { request, addRoom, perform } = ready()
  const first = request({ ...WHO, link: "x0" }).result.participant
  perform(ACCEPT, { workroom: addRoom("A").result.workroom }, { record: first })
  for (let i = 1; i <= 100; i++) expect(request({ ...WHO, link: `x${i}` }).ok).toBe(true)
  expect(request({ ...WHO, link: "over" }).ok).toBe(false)
})

test("ワークルームの名前は重ならない（作るときも、名前を変えるときも）。名前以外は同じ名前のまま変えられる", () => {
  const { rooms, addRoom, perform } = ready()
  const a = addRoom("A", "inko").result.workroom
  const b = addRoom("B", "suzume").result.workroom
  expect(perform(ROOM_ADD, { name: "A", bird: "inko" }).ok).toBe(false)
  expect(perform(ROOM_UPDATE, { name: "A" }, { record: b }).ok).toBe(false)
  expect(perform(ROOM_UPDATE, { name: "A", bird: "buncho", palette: "forest" }, { record: a }).ok).toBe(true)
  expect(rooms().find(r => r.id === a)).toMatchObject({ name: "A", bird: "buncho", palette: "forest" })
})

test("人のいるワークルームは消せず、外してから消せる。消したワークルームの id は戻らない", () => {
  const { rooms, request, addRoom, perform } = ready()
  const id = request().result.participant
  const room = addRoom("A").result.workroom
  perform(ACCEPT, { workroom: room }, { record: id })
  expect(perform(ROOM_REMOVE, {}, { record: room }).ok).toBe(false)
  perform(REMOVE, {}, { record: id })
  expect(perform(ROOM_REMOVE, {}, { record: room }).ok).toBe(true)
  expect(rooms()).toHaveLength(0)
  expect(addRoom("A").result.workroom).not.toBe(room)
})

test("管理者の印は 1 件（id は admin）。ワークルームか none を指し、無いワークルームは断る", () => {
  const { store, addRoom, perform } = ready()
  const room = addRoom("A").result.workroom
  expect(perform(ADMIN_SET, { workroom: "nope" }).ok).toBe(false)
  expect(perform(ADMIN_SET, { workroom: room }).ok).toBe(true)
  expect(store.state.getState().records["@matomezu/base:admin-mark"]).toEqual({
    admin: { id: "admin", workroom: room, by: "user" },
  })
  expect(perform(ADMIN_SET, { workroom: "none" }, { record: "admin" }).ok).toBe(true)
})

test("AI が参加を頼むときに行うアクションと、要求をキャンセルとして終えるアクションは、定義が役を名乗る", () => {
  expect(joinActions(CORE_CATALOG)).toEqual({ participant: REQUEST, rejoin: REJOIN, cancel: CANCEL })
})

test("要求をキャンセルとして終える役（cancelsJoinRequest）は、1 つのアクションだけが名乗る（2 つ目は E067）。名乗る物が無ければ、参加を頼むときのアクション（作る・頼み直しを書く）だけを返す", () => {
  const canceller = BUILTIN_PARTS.actions.find(a => a.cancelsJoinRequest)
  if (!canceller) throw new Error("cancelsJoinRequest が無い")
  const codes = checkCoreCatalog({
    ...BUILTIN_PARTS,
    actions: [...BUILTIN_PARTS.actions, { ...canceller, id: "@ex/j:canceller" }],
  }).map(p => p.code)
  expect(codes).toContain("E067")
  const withoutCancel = { ...CORE_CATALOG, actions: new Map([...CORE_CATALOG.actions].filter(([id]) => id !== CANCEL)) }
  expect(joinActions(withoutCancel)).toEqual({ participant: REQUEST, rejoin: REJOIN })
})

test.each([DECLINE, CANCEL])(
  "%s は要求のレコードを消す（痕跡は残さない）。受け入れた参加者と、無い参加者には行えない。外すとワークルームは空室で残る",
  action => {
    const { people, rooms, request, addRoom, perform } = ready()
    const a = request().result.participant
    expect(perform(action, {}, { record: a }).ok).toBe(true)
    expect(people()).toHaveLength(0)
    expect(perform(action, {}, { record: a })).toMatchObject({ ok: false, reason: "no-record" })
    const b = request({ ...WHO, link: "L2" }).result.participant
    const room = addRoom("A").result.workroom
    perform(ACCEPT, { workroom: room }, { record: b })
    expect(perform(action, {}, { record: b }).ok).toBe(false)
    expect(perform(REMOVE, {}, { record: b }).ok).toBe(true)
    expect(people()).toHaveLength(0)
    expect(rooms().map(r => r.id)).toEqual([room])
  },
)

test("要求は ADE のワークスペースの名前を持てる（受け入れると外す）", () => {
  const { people, request, addRoom, perform } = ready()
  const a = request({ ...WHO, adeWorkspace: "4.M-0168 参加要求" }).result.participant
  expect(people()[0]).toMatchObject({ adeWorkspace: "4.M-0168 参加要求" })
  const room = addRoom("A").result.workroom
  expect(perform(ACCEPT, { workroom: room }, { record: a }).ok).toBe(true)
  expect(people()[0]).not.toHaveProperty("adeWorkspace")
})

test("セッションが終わったときのアクション（participant-remove）は、要求中の参加者も消す", () => {
  const { people, request, perform } = ready()
  const a = request().result.participant
  expect(perform(REMOVE, {}, { record: a }).ok).toBe(true)
  expect(people()).toHaveLength(0)
})

test("AI が参加を頼むときの役（runsWhenAIJoins）は、役ごとに 1 つのアクションだけが名乗る（2 つ目は E044。役が違えば並べてよい）", () => {
  expect(checkCoreCatalog(BUILTIN_PARTS).map(p => p.code)).not.toContain("E044")
  for (const role of ["make-participant", "rejoin-participant"]) {
    const named = BUILTIN_PARTS.actions.find(a => a.runsWhenAIJoins === role)
    if (!named) throw new Error(`${role} が無い`)
    const codes = checkCoreCatalog({
      ...BUILTIN_PARTS,
      actions: [...BUILTIN_PARTS.actions, { ...named, id: "@ex/j:again" }],
    }).map(p => p.code)
    expect(codes).toContain("E044")
  }
})

test("役 participants の種類の state は、常駐が読む値（requested・joined・visitor）をちょうど受ける（足りなくても多くても E130）", () => {
  const owner = BUILTIN_PARTS.subjects.find(s => s.role === "participants")
  if (!owner) throw new Error("役 participants の種類が無い")
  const codesWith = (state: z.ZodType) =>
    checkCoreCatalog({
      ...BUILTIN_PARTS,
      subjects: BUILTIN_PARTS.subjects.map(s =>
        s === owner ? { ...s, record: z.strictObject({ ...s.record.shape, state }) } : s,
      ),
    }).map(p => p.code)
  expect(checkCoreCatalog(BUILTIN_PARTS).map(p => p.code)).not.toContain("E130")
  expect(codesWith(z.enum(["requested", "joined"]))).toContain("E130")
  expect(codesWith(z.enum(["requested", "joined", "visitor", "gone"]))).toContain("E130")
  expect(codesWith(z.string())).toContain("E130")
})

// いる参加者を外して入れる・新しいワークルームを作って入れる・前のワークルームを消して作る・ワークルームを消すは、1 つのアクションで、全部通るか全部断られる
function roomWith(link: string, name: string) {
  const r = ready()
  const holder = r.request({ ...WHO, link }).result.participant
  const room = r.addRoom(name).result.workroom
  expect(r.perform(ACCEPT, { workroom: room }, { record: holder }).ok).toBe(true)
  return { ...r, holder, room }
}

test("いる参加者を外して入れる: 渡した参加者がいれば外して入れ、違えば断って何も変えない。すでにいなくて空なら入れる", () => {
  const { people, request, perform, holder, room } = roomWith("L1", "A")
  const next = request({ ...WHO, link: "L2" }).result.participant
  expect(perform(ACCEPT, { workroom: room }, { record: next }).ok).toBe(false)
  expect(perform(ACCEPT, { workroom: room, occupant: next }, { record: next }).ok).toBe(false)
  expect(people().map(p => p.id)).toContain(holder)
  expect(perform(ACCEPT, { workroom: room, occupant: holder }, { record: next }).ok).toBe(true)
  expect(people().map(p => [p.id, p.state, p.workroom])).toEqual([[next, "joined", room]])
  // 外す参加者が（ホストの退室で）すでにいなくて空なら、そのまま入れる
  const third = request({ ...WHO, link: "L3" }).result.participant
  perform(REMOVE, {}, { record: next })
  expect(perform(ACCEPT, { workroom: room, occupant: next }, { record: third }).ok).toBe(true)
})

test("新しいワークルームを作って入れる: ワークルームの id を返し、名前が重なれば断る", () => {
  const { people, rooms, request, addRoom, perform } = ready()
  const a = request().result.participant
  const done = perform(ACCEPT, { newWorkroom: { name: "N", bird: "buncho" } }, { record: a })
  expect(done.ok).toBe(true)
  const made = (done.result as { workroom: string }).workroom
  expect(rooms()).toMatchObject([{ id: made, name: "N", bird: "buncho" }])
  expect(people()[0]).toMatchObject({ state: "joined", workroom: made })
  const b = request({ ...WHO, link: "L2" }).result.participant
  expect(perform(ACCEPT, { newWorkroom: { name: "N", bird: "inko" } }, { record: b }).ok).toBe(false)
  addRoom("M")
  expect(rooms()).toHaveLength(2)
  expect(people().find(p => p.id === b)?.state).toBe("requested")
})

test("前のワークルームを消して新しく始める: 同じ名前でよく、外した人と消したワークルームが無くなる。名前が別のワークルームと重なれば断り、外した人も消したワークルームも残る", () => {
  const { people, rooms, request, addRoom, perform, holder, room } = roomWith("L1", "A")
  const other = addRoom("B").result.workroom
  const next = request({ ...WHO, link: "L2" }).result.participant
  const bad = { newWorkroom: { name: "B", bird: "inko" }, discarding: { workroom: room, occupant: holder } }
  expect(perform(ACCEPT, bad, { record: next }).ok).toBe(false)
  expect(people().map(p => p.id)).toContain(holder)
  expect(rooms().map(r => r.id)).toContain(room)
  const wrong = { newWorkroom: { name: "A", bird: "inko" }, discarding: { workroom: room, occupant: next } }
  expect(perform(ACCEPT, wrong, { record: next }).ok).toBe(false)
  expect(rooms().map(r => r.id)).toContain(room)
  const good = { newWorkroom: { name: "A", bird: "inko" }, discarding: { workroom: room, occupant: holder } }
  const done = perform(ACCEPT, good, { record: next })
  expect(done.ok).toBe(true)
  const made = (done.result as { workroom: string }).workroom
  expect(made).not.toBe(room)
  expect(
    rooms()
      .map(r => r.id)
      .sort(),
  ).toEqual([made, other].sort())
  expect(people().map(p => [p.id, p.workroom])).toEqual([[next, made]])
})

test("ワークルームを消す: いる参加者を一緒に外し、渡した参加者が違えば断って何も変えない。すでにいなくて空なら消せる", () => {
  const { people, rooms, perform, holder, room } = roomWith("L1", "A")
  expect(perform(ROOM_REMOVE, {}, { record: room }).ok).toBe(false)
  expect(perform(ROOM_REMOVE, { occupant: "other" }, { record: room }).ok).toBe(false)
  expect(people()).toHaveLength(1)
  expect(rooms()).toHaveLength(1)
  expect(perform(ROOM_REMOVE, { occupant: holder }, { record: room }).ok).toBe(true)
  expect(people()).toHaveLength(0)
  expect(rooms()).toHaveLength(0)
  // 外す参加者がすでにいなくて空のワークルームも消せる
  const again = roomWith("L9", "C")
  again.perform(REMOVE, {}, { record: again.holder })
  expect(again.perform(ROOM_REMOVE, { occupant: again.holder }, { record: again.room }).ok).toBe(true)
})

const ADMIN_MARK = "@matomezu/base:admin-mark"
const adminOf = (store: ReturnType<typeof ready>["store"]) =>
  (store.state.getState().records[ADMIN_MARK]?.admin as { workroom: string } | undefined)?.workroom

test("ビジターとして受け入れると、ワークルームを持たない visitor になる。ワークルームも管理者の印も変えない。外すと消える", () => {
  const { store, people, rooms, request, perform } = ready()
  const id = request().result.participant
  expect(perform(ACCEPT, { as: "visitor" }, { record: id })).toMatchObject({ ok: true, result: { workroom: "none" } })
  expect(people()).toEqual([expect.objectContaining({ id, state: "visitor", joinedAt: expect.any(String) })])
  expect(people()[0]?.workroom).toBeUndefined()
  expect(rooms()).toHaveLength(0)
  expect(adminOf(store)).toBeUndefined()
  expect(perform(ACCEPT, { as: "visitor" }, { record: id }).ok).toBe(false)
  expect(perform(REMOVE, {}, { record: id }).ok).toBe(true)
  expect(people()).toHaveLength(0)
})

test("ビジターとして頼んだ要求は、ビジターとしてだけ受け入れる。ワークルームの名前と一緒には頼めない", () => {
  const { people, request, addRoom, perform } = ready()
  expect(perform(REQUEST, { ...WHO, as: "visitor", wantedName: "A" }).ok).toBe(false)
  const id = request({ ...WHO, as: "visitor" }).result.participant
  expect(people()[0]).toMatchObject({ state: "requested", as: "visitor" })
  const room = addRoom("A").result.workroom
  expect(perform(ACCEPT, { workroom: room }, { record: id }).ok).toBe(false)
  expect(perform(ACCEPT, { newWorkroom: { name: "B", bird: "inko" } }, { record: id }).ok).toBe(false)
  expect(perform(ACCEPT, { as: "visitor" }, { record: id }).ok).toBe(true)
  expect(people()[0]).toMatchObject({ state: "visitor" })
  expect(people()[0]).not.toHaveProperty("as")
})

test("管理者がいなければ、受け入れたワーカーのワークルームが管理者になる（印が無い・指す先が無い・同じ受け入れで消すワークルームを指す）。none と、在るワークルームを指す印は変えない", () => {
  // 印が無い: 1 人目のワーカーが管理者になり、2 人目は変えない
  const a = ready()
  const first = a.request().result.participant
  const roomA = (
    a.perform(ACCEPT, { newWorkroom: { name: "A", bird: "inko" } }, { record: first }) as Done & {
      result: { workroom: string }
    }
  ).result.workroom
  expect(adminOf(a.store)).toBe(roomA)
  const second = a.request({ ...WHO, link: "L2" }).result.participant
  const roomB = a.addRoom("B").result.workroom
  expect(a.perform(ACCEPT, { workroom: roomB }, { record: second }).ok).toBe(true)
  expect(adminOf(a.store)).toBe(roomA)

  // none は残す
  const b = ready()
  expect(b.perform(ADMIN_SET, { workroom: "none" }).ok).toBe(true)
  const p = b.request().result.participant
  expect(b.perform(ACCEPT, { newWorkroom: { name: "A", bird: "inko" } }, { record: p }).ok).toBe(true)
  expect(adminOf(b.store)).toBe("none")

  // 指す先が無い印は、入れたワークルームに付け替える
  const c = ready()
  const gone = c.addRoom("G").result.workroom
  expect(c.perform(ADMIN_SET, { workroom: gone }).ok).toBe(true)
  expect(c.perform(ROOM_REMOVE, {}, { record: gone }).ok).toBe(true)
  const q = c.request().result.participant
  const roomC = c.addRoom("C").result.workroom
  expect(c.perform(ACCEPT, { workroom: roomC }, { record: q }).ok).toBe(true)
  expect(adminOf(c.store)).toBe(roomC)

  // 同じ受け入れで消すワークルームが管理者なら、新しいワークルームに付け替える
  const d = ready()
  const old = d.request().result.participant
  const oldRoom = (
    d.perform(ACCEPT, { newWorkroom: { name: "A", bird: "inko" } }, { record: old }) as Done & {
      result: { workroom: string }
    }
  ).result.workroom
  expect(adminOf(d.store)).toBe(oldRoom)
  const next = d.request({ ...WHO, link: "L2" }).result.participant
  const made = d.perform(
    ACCEPT,
    { newWorkroom: { name: "A", bird: "suzume" }, discarding: { workroom: oldRoom, occupant: old } },
    { record: next },
  ) as Done & { result: { workroom: string } }
  expect(made.ok).toBe(true)
  expect(adminOf(d.store)).toBe(made.result.workroom)
})

test("頼み直しを書く（participant-rejoin）: 受け入れ済みの参加者の環境・セッション名・AI の UI を届いた物にし、届かなかったセッション名と AI の UI は残す。要求中には行えず、AI は行えない（利用者だけ）", () => {
  const { people, request, addRoom, perform } = ready()
  const id = request({ ...WHO, aiUi: "terminal" }).result.participant
  expect(perform(REJOIN, { ...WHO, env: "windows" }, { record: id }).ok).toBe(false)
  const room = addRoom("A").result.workroom
  expect(perform(ACCEPT, { workroom: room }, { record: id }).ok).toBe(true)
  expect(perform(REJOIN, { ...WHO, env: "windows", sessionName: "desk", aiUi: "desktop" }, { record: id }).ok).toBe(
    true,
  )
  expect(people()[0]).toMatchObject({
    state: "joined",
    workroom: room,
    env: "windows",
    sessionName: "desk",
    aiUi: "desktop",
  })
  const { sessionName: _, ...withoutName } = WHO
  expect(perform(REJOIN, { ...withoutName, env: "wsl" }, { record: id }).ok).toBe(true)
  expect(people()[0]).toMatchObject({ env: "wsl", sessionName: "desk", aiUi: "desktop" })
  // 知らない AI の UI も断らずに残す
  expect(perform(REJOIN, { ...WHO, aiUi: "phone" }, { record: id }).ok).toBe(true)
  expect(people()[0]).toMatchObject({ aiUi: "phone" })
  expect(CORE_CATALOG.actions.get(REJOIN)?.userOnly).toBe(true)
})
