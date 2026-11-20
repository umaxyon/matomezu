// 郵便（base の郵便の種類の手紙）: 郵便 1 通は対象の定義 mail のレコード 1 件で、届いた順は order。送るのは AI もでき、見た・行き先を見た・消すは利用者だけ（on の record で指す）。
// 既読は 2 つ（郵便を見た seenAt、行き先を見た visitedAt）で、どちらも一度だけ付く。上限 200 通は、送るアクションが「1 通足す＋古い郵便を消す」を 1 回で返して守る

import { expect, test } from "bun:test"
import { AI } from "../../../web/src/core/actor"
import { performIn } from "../../../web/src/core/perform"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { MAIL, mailboxOf } from "../../../web/src/plugins/base/mail"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"
import { placeShown } from "../../../web/src/plugins/base/mail/visited"
import { CORE_CATALOG, newStore } from "../../support"

const SEND = "@matomezu/base:mail-send"
const SEEN = "@matomezu/base:mail-seen"
const VISITED = "@matomezu/base:mail-visited"
const REMOVE = "@matomezu/base:mail-remove"

function ready() {
  const store = newStore()
  const mails = (): readonly Mail[] => mailboxOf(store.state.getState().records)
  const send = (args: object) => store.actions.perform(SEND, args as never)
  const perform = store.actions.perform as (id: string, args: unknown, on?: { record: string }) => { ok: boolean }
  // 郵便 mail を指して行う
  const on = (id: string, mail: string, args: object = {}) => perform(id, args, { record: mail }).ok
  return { store, mails, send, on }
}

test("手紙を送ると郵便箱の末尾に届き、id を返す。送り手・題・本文・行き先・届いた時点を持ち、まだ見ていない", () => {
  const { mails, send } = ready()
  const done = send({
    from: "D64 郵便",
    title: "済みました",
    body: "直しました",
    to: { book: "b1", page: "p1" },
  })
  expect(done).toMatchObject({ ok: true, result: { mail: expect.any(String) } })
  expect(mails()).toEqual([
    {
      id: done.ok ? (done.result as { mail: string }).mail : "",
      mail: "@matomezu/base:letter",
      from: "D64 郵便",
      sentAt: expect.any(String),
      to: { book: "b1", page: "p1" },
      props: { title: "済みました", body: "直しました" },
      order: 1,
    },
  ])
  // 題が空なら送らない
  expect(send({ from: "D64", title: " " }).ok).toBe(false)
})

test("見た・行き先を見たは一度だけ付く。行き先の無い郵便は、行き先を見たにならない。消すと無くなる", () => {
  const { mails, send, on } = ready()
  send({ from: "a", title: "行き先あり", to: { book: "b1" } })
  send({ from: "a", title: "行き先なし" })
  const [placed, plain] = mails().map(m => m.id) as [string, string]
  const run = (id: string, mail: string) => on(id, mail)
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
  const world = {
    pages: s.pages,
    folders: s.folders,
    settings: s.settings,
    annotations: s.annotations,
    records: s.records,
    counters: s.counters,
  }
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER as never,
    lang: "en" as const,
    newId: () => "n",
    now: "t",
    today: "2026-01-01",
    actor: AI,
  }
  const ai = (action: string, args: unknown, on?: { record: string }) => performIn(world, action, args, on, ctx)
  expect(ai(SEND, { from: "b", title: "y" }).ok).toBe(true)
  const refused = { ok: false, reason: "not-allowed" } as const
  expect(ai(SEEN, {}, { record: id })).toEqual(refused)
  expect(ai(VISITED, {}, { record: id })).toEqual(refused)
  expect(ai(REMOVE, {}, { record: id })).toEqual(refused)
})

test("郵便箱は 200 通まで。超えたら、見た郵便のうち古い物から消え、見ていない郵便しか無ければ古い物から消える", () => {
  const { mails, send, on } = ready()
  for (let i = 0; i < 200; i++) send({ from: "a", title: `t${i}` })
  const fifth = mails()[5]!.id
  on(SEEN, fifth)
  send({ from: "a", title: "t200" })
  expect(mails()).toHaveLength(200)
  expect(mails().some(m => m.id === fifth)).toBe(false)
  expect(mails()[0]!.props).toEqual({ title: "t0", body: "" })
  send({ from: "a", title: "t201" })
  expect(mails()).toHaveLength(200)
  expect(mails()[0]!.props).toEqual({ title: "t1", body: "" })
  // 番号は使い回さない（消した郵便の番号は戻らず、届いた順に増える）
  expect(mails().at(-1)!.order).toBe(202)
  expect(mails().map(m => m.order)).toEqual([...mails().map(m => m.order)].sort((a, b) => a - b))
})

test("上限を超えたときの送るアクションは、足す 1 通と消す郵便を 1 回のアクションの結果として返す（records の並び）。番号は区切り mail で進める", () => {
  const { store, send } = ready()
  for (let i = 0; i < 200; i++) send({ from: "a", title: `t${i}` })
  const s = store.state.getState()
  const done = performIn(
    {
      pages: s.pages,
      folders: s.folders,
      settings: s.settings,
      annotations: s.annotations,
      records: s.records,
      counters: s.counters,
    },
    SEND,
    { from: "a", title: "over" },
    undefined,
    {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "en",
      newId: () => "fresh-mail-id",
      now: "t",
      today: "2026-01-01",
      actor: AI,
    },
  )
  expect(done.ok && done.records?.map(c => [c.subject, c.record === "removed" ? "removed" : "added"])).toEqual([
    [MAIL.id, "added"],
    [MAIL.id, "removed"],
  ])
  expect(done.ok && done.counters).toEqual({ [MAIL.id]: { mail: 202 } })
})

test("行き先が出ているか: そのブックのそのページを開いていて、物があればその物が表示領域に入っている", () => {
  const m = (to: Mail["to"]): Mail => ({
    id: "m",
    mail: "@matomezu/base:letter",
    from: "a",
    sentAt: "t",
    props: {},
    order: 1,
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
