// 参加者・ワークルーム・管理者の印（base の対象の定義。レコード）: 要求は AI も行え、受け入れる・外す・部屋を作る・消すは利用者だけ。
// 部屋の名前は重ならず、部屋に入る参加者は 1 人で、人のいる部屋は消せない。参加要求の郵便（mail-join-request）は、別の種類（郵便のレコード）として届く

import { expect, test } from "bun:test"
import { z } from "zod"
import { AI, USER } from "../../../web/src/core/actor"
import { checkCoreCatalog } from "../../../web/src/core/core-catalog"
import { translate } from "../../../web/src/core/i18n/i18n"
import { joinActions } from "../../../web/src/core/participant"
import { performIn } from "../../../web/src/core/perform"
import { mailboxOf } from "../../../web/src/plugins/base/mail"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"
import { type MailT, shownOf } from "../../../web/src/plugins/base/mail/shown"
import { BUILTIN_PARTS, CORE_CATALOG, newStore } from "../../support"

const PARTICIPANT = "@matomezu/base:participant"
const WORKROOM = "@matomezu/base:workroom"
const REQUEST = "@matomezu/base:participant-request"
const ACCEPT = "@matomezu/base:participant-accept"
const DECLINE = "@matomezu/base:participant-decline"
const REMOVE = "@matomezu/base:participant-remove"
const ROOM_ADD = "@matomezu/base:workroom-add"
const ROOM_UPDATE = "@matomezu/base:workroom-update"
const ROOM_REMOVE = "@matomezu/base:workroom-remove"
const ADMIN_SET = "@matomezu/base:admin-set"
const JOIN_MAIL = "@matomezu/base:mail-join-request"

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

test("ワークルームの名前は 20 字まで（要求の希望も、部屋を作るときも。21 字は断り、20 字は通す）", () => {
  const { request, addRoom, perform } = ready()
  expect(request({ ...WHO, wantedName: "あ".repeat(21) }).ok).toBe(false)
  expect(request({ ...WHO, wantedName: "あ".repeat(20) }).ok).toBe(true)
  expect(perform(ROOM_ADD, { name: "い".repeat(21), bird: "inko" }).ok).toBe(false)
  expect(addRoom("い".repeat(20)).ok).toBe(true)
})

test("受け入れると、部屋を指して受け入れた時点を書く（希望の名前は外す）。2 回目の受け入れと、人のいる部屋・無い部屋への受け入れは断る", () => {
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

test("断ると要求のレコードが消える。受け入れた参加者と、無い参加者は断れない。外すと部屋は空室で残る", () => {
  const { people, rooms, request, addRoom, perform } = ready()
  const a = request().result.participant
  expect(perform(DECLINE, {}, { record: a }).ok).toBe(true)
  expect(people()).toHaveLength(0)
  expect(perform(DECLINE, {}, { record: a })).toMatchObject({ ok: false, reason: "no-record" })
  const b = request({ ...WHO, link: "L2" }).result.participant
  const room = addRoom("A").result.workroom
  perform(ACCEPT, { workroom: room }, { record: b })
  expect(perform(DECLINE, {}, { record: b }).ok).toBe(false)
  expect(perform(REMOVE, {}, { record: b }).ok).toBe(true)
  expect(people()).toHaveLength(0)
  expect(rooms().map(r => r.id)).toEqual([room])
})

test("AI は要求できるが、受け入れる・外す・部屋を作る・消す・管理者を決めるはできない（利用者だけ）", () => {
  const { store, request, addRoom } = ready()
  const id = request().result.participant
  const room = addRoom("A").result.workroom
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center" as never,
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
        controlCenter: "@matomezu/control-center:control-center" as never,
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

test("部屋の名前は重ならない（作るときも、名前を変えるときも）。名前以外は同じ名前のまま変えられる", () => {
  const { rooms, addRoom, perform } = ready()
  const a = addRoom("A", "inko").result.workroom
  const b = addRoom("B", "suzume").result.workroom
  expect(perform(ROOM_ADD, { name: "A", bird: "inko" }).ok).toBe(false)
  expect(perform(ROOM_UPDATE, { name: "A" }, { record: b }).ok).toBe(false)
  expect(perform(ROOM_UPDATE, { name: "A", bird: "buncho", palette: "forest" }, { record: a }).ok).toBe(true)
  expect(rooms().find(r => r.id === a)).toMatchObject({ name: "A", bird: "buncho", palette: "forest" })
})

test("人のいる部屋は消せず、外してから消せる。消した部屋の id は戻らない", () => {
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

test("管理者の印は 1 件（id は admin）。部屋か none を指し、無い部屋は断る", () => {
  const { store, addRoom, perform } = ready()
  const room = addRoom("A").result.workroom
  expect(perform(ADMIN_SET, { workroom: "nope" }).ok).toBe(false)
  expect(perform(ADMIN_SET, { workroom: room }).ok).toBe(true)
  expect(store.state.getState().records["@matomezu/base:admin-mark"]).toEqual({
    admin: { id: "admin", workroom: room },
  })
  expect(perform(ADMIN_SET, { workroom: "none" }, { record: "admin" }).ok).toBe(true)
})

test("参加要求の郵便は郵便箱に届き、本文に ai・model・env・セッション名を持つ（送るたびに 1 通届く。同じ参加者の郵便があるかは見ない）", () => {
  const { store, perform } = ready()
  const args = {
    from: "claude",
    participant: "p1",
    ai: "claude",
    model: "opus",
    env: "wsl",
    sessionName: "D92",
  }
  const done = perform(JOIN_MAIL, args) as { ok: boolean; result: { mail: string } }
  expect(done.ok).toBe(true)
  const mails = (): readonly Mail[] => mailboxOf(store.state.getState().records)
  expect(mails()).toEqual([
    {
      id: done.result.mail,
      mail: "@matomezu/base:join-request",
      from: "claude",
      sentAt: expect.any(String),
      props: { participant: "p1", ai: "claude", model: "opus", env: "wsl", sessionName: "D92" },
      order: 1,
    },
  ])
  const ja: MailT = (key, params) => translate(CORE_CATALOG.messages, "ja", key, params)
  expect(shownOf(CORE_CATALOG, mails()[0]!, ja)).toMatchObject({
    title: "AI エージェントから参加要求が届きました",
    body: "AI: claude\nモデル: opus\n環境: wsl\nセッション: D92",
  })
  expect(perform(JOIN_MAIL, { ...args, participant: "p2" }).ok).toBe(true)
  expect(mails()).toHaveLength(2)
})

test("AI が参加を頼むときに行うアクションは、定義が役を名乗る", () => {
  expect(joinActions(CORE_CATALOG)).toEqual({ participant: REQUEST, notice: JOIN_MAIL })
})

test("参加要求の郵便は、頼まれたワークルームの名前を本文に出す", () => {
  const { store, perform } = ready()
  const args = {
    from: "claude",
    participant: "p1",
    ai: "claude",
    model: "opus",
    env: "wsl",
    workroom: "ひよこ",
  }
  expect(perform(JOIN_MAIL, args).ok).toBe(true)
  const ja: MailT = (key, params) => translate(CORE_CATALOG.messages, "ja", key, params)
  const [mail] = mailboxOf(store.state.getState().records)
  expect(shownOf(CORE_CATALOG, mail!, ja)).toMatchObject({
    title: "AI エージェントから参加要求が届きました",
    body: "ワークルーム名: ひよこ\nAI: claude\nモデル: opus\n環境: wsl",
  })
})

test("AI が参加を頼むときの役（runsWhenAIJoins）は、1 つの役を 1 つのアクションだけが名乗る（2 つ目は E044）", () => {
  const maker = BUILTIN_PARTS.actions.find(a => a.runsWhenAIJoins === "make-participant")
  if (!maker) throw new Error("make-participant が無い")
  const codes = checkCoreCatalog({
    ...BUILTIN_PARTS,
    actions: [...BUILTIN_PARTS.actions, { ...maker, id: "@ex/j:maker" }],
  }).map(p => p.code)
  expect(codes).toContain("E044")
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

// いる参加者を外して入れる・新しい部屋を作って入れる・前の部屋を消して作る・部屋を消すは、1 つのアクションで、全部通るか全部断られる
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

test("新しい部屋を作って入れる: 部屋の id を返し、名前が重なれば断る", () => {
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

test("前の部屋を消して新しく始める: 同じ名前でよく、外した人と消した部屋が無くなる。名前が別の部屋と重なれば断り、外した人も消した部屋も残る", () => {
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

test("部屋を消す: いる参加者を一緒に外し、渡した参加者が違えば断って何も変えない。すでにいなくて空なら消せる", () => {
  const { people, rooms, perform, holder, room } = roomWith("L1", "A")
  expect(perform(ROOM_REMOVE, {}, { record: room }).ok).toBe(false)
  expect(perform(ROOM_REMOVE, { occupant: "other" }, { record: room }).ok).toBe(false)
  expect(people()).toHaveLength(1)
  expect(rooms()).toHaveLength(1)
  expect(perform(ROOM_REMOVE, { occupant: holder }, { record: room }).ok).toBe(true)
  expect(people()).toHaveLength(0)
  expect(rooms()).toHaveLength(0)
  // 外す参加者がすでにいなくて空の部屋も消せる
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

test("管理者がいなければ、受け入れたワーカーのワークルームが管理者になる（印が無い・指す先が無い・同じ受け入れで消す部屋を指す）。none と、在る部屋を指す印は変えない", () => {
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

  // 同じ受け入れで消す部屋が管理者なら、新しい部屋に付け替える
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
