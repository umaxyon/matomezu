// 郵便（base の郵便の種類の手紙）: 郵便箱は利用者に 1 つで、ブックのデータとは別に持つ。送るのは AI もでき、見た・行き先を見た・消すは利用者だけ。
// 既読は 2 つ（郵便を見た seenAt、行き先を見た visitedAt）で、どちらも一度だけ付く
import { expect, test } from "bun:test"
import type { Mail } from "../../web/src/core/mail"
import { performIn } from "../../web/src/core/perform"
import { placeShown } from "../../web/src/plugins/base/mail/visited"
import { CORE_CATALOG, newStore } from "../support"

const SEND = "@matomezu/base:mail-send"
const SEEN = "@matomezu/base:mail-seen"
const VISITED = "@matomezu/base:mail-visited"
const REMOVE = "@matomezu/base:mail-remove"

function ready() {
  const store = newStore()
  const mails = (): readonly Mail[] => store.state.getState().mailbox
  const send = (args: object) => store.actions.perform(SEND, args as never)
  return { store, mails, send }
}

test("手紙を送ると郵便箱の末尾に届き、id を返す。送り手・題・本文・行き先・届いた時点を持ち、まだ見ていない", () => {
  const { mails, send } = ready()
  const done = send({ from: "D64 郵便", title: "済みました", body: "直しました", to: { book: "b1", page: "p1" } })
  expect(done).toMatchObject({ ok: true, result: { mail: expect.any(String) } })
  expect(mails()).toEqual([
    {
      id: done.ok ? (done.result as { mail: string }).mail : "",
      mail: "@matomezu/base:letter",
      from: "D64 郵便",
      sentAt: expect.any(String),
      to: { book: "b1", page: "p1" },
      props: { title: "済みました", body: "直しました" },
    },
  ])
  // 題が空なら送らない
  expect(send({ from: "D64", title: " " }).ok).toBe(false)
})

test("見た・行き先を見たは一度だけ付く。行き先の無い郵便は、行き先を見たにならない。消すと無くなる", () => {
  const { store, mails, send } = ready()
  send({ from: "a", title: "行き先あり", to: { book: "b1" } })
  send({ from: "a", title: "行き先なし" })
  const [placed, plain] = mails().map(m => m.id) as [string, string]
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  const run = (id: string, mail: string) => perform(id, { mail }).ok
  expect(run(SEEN, placed)).toBe(true)
  expect(run(SEEN, placed)).toBe(false)
  expect(run(VISITED, placed)).toBe(true)
  expect(run(VISITED, placed)).toBe(false)
  expect(run(VISITED, plain)).toBe(false)
  expect(mails()[0]).toMatchObject({ seenAt: expect.any(String), visitedAt: expect.any(String) })
  expect(run(REMOVE, plain)).toBe(true)
  expect(mails().map(m => m.id)).toEqual([placed])
  expect(run(REMOVE, plain)).toBe(false)
})

test("AI は手紙を送れるが、見た・行き先を見た・消すはできない（利用者だけ）", () => {
  const { store, mails, send } = ready()
  send({ from: "a", title: "x" })
  const id = mails()[0]!.id
  const s = store.state.getState()
  const world = { books: s.books, settings: s.settings, annotations: s.annotations, mailbox: s.mailbox }
  const ctx = {
    catalog: CORE_CATALOG,
    home: "@matomezu/master:master" as never,
    lang: "en" as const,
    newId: () => "n",
    now: "t",
    by: "ai" as const,
  }
  const ai = (action: string, args: unknown) => performIn(world, action, args, undefined, ctx)
  expect(ai(SEND, { from: "b", title: "y" }).ok).toBe(true)
  const refused = { ok: false, reason: "not-allowed" } as const
  expect(ai(SEEN, { mail: id })).toEqual(refused)
  expect(ai(VISITED, { mail: id })).toEqual(refused)
  expect(ai(REMOVE, { mail: id })).toEqual(refused)
})

test("郵便箱は 200 通まで。超えたら、見た郵便のうち古い物から消え、見ていない郵便しか無ければ古い物から消える", () => {
  const { store, mails, send } = ready()
  for (let i = 0; i < 200; i++) send({ from: "a", title: `t${i}` })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  const fifth = mails()[5]!.id
  perform(SEEN, { mail: fifth })
  send({ from: "a", title: "t200" })
  expect(mails()).toHaveLength(200)
  expect(mails().some(m => m.id === fifth)).toBe(false)
  expect(mails()[0]!.props).toEqual({ title: "t0", body: "" })
  send({ from: "a", title: "t201" })
  expect(mails()).toHaveLength(200)
  expect(mails()[0]!.props).toEqual({ title: "t1", body: "" })
})

test("行き先が出ているか: そのブックのそのページを開いていて、物があればその物が表示領域に入っている", () => {
  const m = (to: Mail["to"]): Mail => ({
    id: "m",
    mail: "@matomezu/base:letter",
    from: "a",
    sentAt: "t",
    props: {},
    ...(to ? { to } : {}),
  })
  const stages = [{ id: "s1", book: "b1", page: "p1" }]
  const none = () => false
  const shows = (_stage: string, id: string) => id === "x"
  expect(placeShown(m({ book: "b1" }), stages, none)).toBe(true)
  expect(placeShown(m({ book: "b1", page: "p2" }), stages, none)).toBe(false)
  expect(placeShown(m({ book: "b1", page: "p1", ids: ["y"] }), stages, shows)).toBe(false)
  expect(placeShown(m({ book: "b1", page: "p1", ids: ["y", "x"] }), stages, shows)).toBe(true)
  expect(placeShown(m(undefined), stages, none)).toBe(false)
})
