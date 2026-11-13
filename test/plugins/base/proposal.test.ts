// 変更提案郵便（base の郵便の種類 proposal）: 送るときに乗せた変更を試し、当たる物の値を郵便にしまう。反映は乗せた変更を順に 1 つのアクションで行い、
// 送ったあとに当たる物が変わっていたら断る。反映した・失敗したは郵便に一度だけ残す

import { expect, test } from "bun:test"
import { AI, USER } from "../../../web/src/core/actor"
import { performIn } from "../../../web/src/core/perform"
import { MAIL, mailboxOf } from "../../../web/src/plugins/base/mail"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"
import { type ProposalProps, proposalChanged } from "../../../web/src/plugins/base/mail/proposal"
import { CORE_CATALOG, newStore } from "../../support"

const SEND = "@matomezu/base:proposal-send"
const APPLY = "@matomezu/base:proposal-apply"
const SETTLE = "@matomezu/base:proposal-settle"

function ready() {
  const store = newStore()
  const perform = store.actions.perform as (
    id: string,
    args: unknown,
    on?: { book: string } | { record: string },
  ) => {
    ok: boolean
    result?: unknown
    reason?: string
    detail?: string
    kind?: string
  }
  const on = { book: "b1" }
  const place = (x: number, caption: string) =>
    (
      perform(
        "@matomezu/paper:item-place",
        { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x, y: 100 }, props: { caption } },
        on,
      ).result as { item: string }
    ).item
  const one = place(100, "一")
  const two = place(400, "二")
  const rename = (item: string, caption: string) => ({
    action: "@matomezu/paper:item-update",
    args: { page: "p1", item, props: { caption } },
  })
  const send = (changes: object[]) =>
    perform(SEND, { from: "E51", title: "名前を直す", book: "b1", page: "p1", changes })
  const mail = (): Mail => mailboxOf(store.state.getState().records).at(-1) as Mail
  const props = () => mail().props as ProposalProps
  const apply = () => perform(APPLY, { page: "p1", changes: props().changes, snapshot: props().snapshot }, on)
  const caption = (item: string) =>
    (
      store.state.getState().books.b1 as unknown as {
        pages: { items: { id: string; props: { caption: string } }[] }[]
      }
    ).pages[0]?.items.find(i => i.id === item)?.props.caption
  return { store, perform, on, one, two, rename, send, mail, props, apply, caption }
}

test("送ると、乗せた変更と、当たる物の送った時の値と、行き先（ページと当たる物）を持つ郵便が届く。ブックは変わらない", () => {
  const { send, mail, props, one, rename, caption } = ready()
  const done = send([rename(one, "AI")])
  expect(done).toMatchObject({ ok: true, result: { mail: expect.any(String) } })
  expect(mail()).toMatchObject({ mail: "@matomezu/base:proposal", to: { book: "b1", page: "p1", ids: [one] } })
  expect(Object.keys(props().snapshot)).toEqual([one])
  expect(caption(one)).toBe("一")
})

test("物を足す変更・利用者だけの変更・行えない変更・何も変えない変更は送らず、理由を返す", () => {
  const { send, one, rename } = ready()
  const add = {
    action: "@matomezu/paper:item-place",
    args: { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 700, y: 100 } },
  }
  expect(send([add])).toMatchObject({ ok: false, detail: expect.stringContaining("adds things") })
  expect(send([{ action: "@matomezu/base:book-revert", args: {} }])).toMatchObject({
    ok: false,
    detail: expect.stringContaining("only actions that change a book"),
  })
  expect(send([rename("nothing", "AI")])).toMatchObject({ ok: false, detail: expect.stringContaining("refused") })
  expect(send([rename(one, "一")])).toMatchObject({ ok: false, detail: "the changes change nothing" })
})

test("反映すると乗せた変更を順に行い、画面の履歴の段は 1 つ。反映したを一度だけ残す", () => {
  const { store, perform, send, mail, apply, one, two, rename, caption } = ready()
  send([rename(one, "AI 一"), rename(two, "AI 二")])
  const steps = store.state.getState().history.b1?.undo.length ?? 0
  expect(apply()).toMatchObject({ ok: true })
  expect([caption(one), caption(two)]).toEqual(["AI 一", "AI 二"])
  return Promise.resolve().then(() => {
    expect(store.state.getState().history.b1?.undo).toHaveLength(steps + 1)
    expect(perform(SETTLE, { outcome: "applied" }, { record: mail().id }).ok).toBe(true)
    expect(mail().props).toMatchObject({ appliedAt: expect.any(String) })
    expect(perform(SETTLE, { outcome: "failed" }, { record: mail().id }).ok).toBe(false)
  })
})

test("送ったあとに当たる物が変わっていたら反映を断り（proposal-changed）、変わった物が分かる。ほかの物が変わっていても反映できる", () => {
  const { store, perform, on, send, props, apply, one, two, rename, caption } = ready()
  send([rename(one, "AI")])
  perform("@matomezu/paper:item-update", { page: "p1", item: two, props: { caption: "利用者" } }, on)
  expect(apply()).toMatchObject({ ok: true })
  send([rename(one, "AI 2")])
  perform("@matomezu/paper:item-update", { page: "p1", item: one, props: { caption: "利用者" } }, on)
  expect(apply()).toMatchObject({ ok: false, kind: "@matomezu/base:proposal-changed" })
  expect(caption(one)).toBe("利用者")
  expect(proposalChanged(store.state.getState().books.b1 as never, props().snapshot)).toEqual([one])
})

test("乗せた変更の途中が断られたら、全部取り消す（proposal-refused）", () => {
  const { send, props, apply, one, two, rename, caption, perform, on } = ready()
  send([rename(one, "AI 一"), rename(two, "AI 二")])
  const { changes, snapshot } = props()
  // 二つ目の変更だけが断られる形にする（無い物の名前を直す）
  const broken = [changes[0], rename("nothing", "AI")]
  expect(perform(APPLY, { page: "p1", changes: broken, snapshot }, on)).toMatchObject({
    ok: false,
    kind: "@matomezu/base:proposal-refused",
  })
  expect([caption(one), caption(two)]).toEqual(["一", "二"])
  expect(apply()).toMatchObject({ ok: true })
})

test("反映と結果を残すのは利用者だけ。送るのは AI もできる", () => {
  const { store, send, one, rename } = ready()
  send([rename(one, "AI")])
  const world = { ...store.state.getState(), books: store.state.getState().books }
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: null,
    lang: "ja" as const,
    newId: () => "x",
    now: "t",
    actor: AI,
  }
  const settle = performIn(world as never, SETTLE, { outcome: "applied" }, { record: "m" }, ctx)
  expect(settle).toMatchObject({ ok: false })
})

test("送るときに読むのは、引数 book のブック 1 冊だけ（readsBooks）。送ると AI 編集チケットを作り、結果を残すと閉じる・失敗にする", () => {
  const { store, send, one, rename, mail } = ready()
  const s = store.state.getState()
  const def = CORE_CATALOG.actions.get(SEND)
  expect(def?.readsBooks?.({ book: "b1" } as never)).toEqual(["b1"])
  // 読んだブックを見張る: ほかのブックは ctx.books に入らない
  const seen: string[][] = []
  const watching = {
    ...CORE_CATALOG,
    actions: new Map<string, unknown>([
      ...CORE_CATALOG.actions,
      [
        SEND,
        {
          ...def,
          run: (now: never, args: never, ctx: { books?: Record<string, unknown> }) => {
            seen.push(Object.keys(ctx.books ?? {}))
            return (def as { run: (...a: unknown[]) => unknown }).run(now, args, ctx)
          },
        },
      ],
    ]),
  }
  const world = {
    books: { ...s.books, other: { ...s.books.b1, id: "other" } },
    settings: s.settings,
    annotations: s.annotations,
    records: s.records,
    counters: s.counters,
  }
  const ctx = {
    catalog: watching as never,
    controlCenter: "@matomezu/control-center:control-center" as never,
    lang: "ja" as const,
    newId: () => "fresh-mail-1",
    now: "t",
    actor: AI,
  }
  const done = performIn(
    world as never,
    SEND,
    { from: "E51", title: "名前", book: "b1", page: "p1", changes: [rename(one, "AI")] },
    undefined,
    ctx,
  )
  expect(seen).toEqual([["b1"]])
  expect(done).toMatchObject({
    ok: true,
    records: [{ subject: MAIL.id, id: "freshmail1" }],
    aiEditTickets: [{ book: "b1", key: "freshmail1", outcome: "open" }],
  })
  send([rename(one, "AI 2")])
  const settled = performIn(
    { ...world, records: store.state.getState().records } as never,
    SETTLE,
    { outcome: "failed", changed: [one] },
    { record: mail().id },
    { ...ctx, catalog: CORE_CATALOG, actor: USER },
  )
  expect(settled).toMatchObject({
    ok: true,
    aiEditTickets: [{ book: "b1", key: mail().id, outcome: "failed", changed: [one] }],
  })
})

// 郵便のレコード（id・種類・届いた順と、中身 props。seen なら見た郵便）
const mailRecord = (id: string, order: number, kind: string, props: object, seen = false): Mail => ({
  id,
  mail: kind,
  from: "E94",
  sentAt: "t",
  ...(seen ? { seenAt: "t" } : {}),
  props,
  order,
})
// ブック book への変更提案郵便の中身（extra は反映した・失敗したの時点など）
const proposalProps = (book: string, extra: object = {}) => ({
  title: "提案",
  body: "",
  book,
  changes: [{ action: "@matomezu/paper:item-update", args: {} }],
  snapshot: {},
  ...extra,
})
const PROPOSAL = "@matomezu/base:proposal"
const LETTER = "@matomezu/base:letter"

test("上限で反映していない提案が消えると、送ったアクションの結果に、新しい提案の open と消えた提案の removed（cause limit）が 1 回で入る（ほかのブックの提案も）", () => {
  const { store, one, rename } = ready()
  const s = store.state.getState()
  // 上限を 1 通超えた郵便箱（送ると、見た郵便の 2 通が消える）
  const mails: Mail[] = [
    mailRecord("old1", 1, PROPOSAL, proposalProps("b1"), true),
    mailRecord("old2", 2, PROPOSAL, proposalProps("b2"), true),
    ...Array.from({ length: 199 }, (_, i) => mailRecord(`l${i}`, i + 3, LETTER, { title: `t${i}`, body: "" })),
  ]
  const done = performIn(
    {
      ...s,
      records: { ...s.records, [MAIL.id]: Object.fromEntries(mails.map(m => [m.id, m])) },
      counters: { [MAIL.id]: { mail: 202 } },
    } as never,
    SEND,
    { from: "E94", title: "名前", book: "b1", page: "p1", changes: [rename(one, "AI")] },
    undefined,
    {
      catalog: CORE_CATALOG,
      controlCenter: "@matomezu/control-center:control-center" as never,
      lang: "ja",
      newId: () => "fresh-mail-1",
      now: "t",
      actor: AI,
    },
  )
  expect(done.ok && done.records?.map(c => [c.id, c.record === "removed"])).toEqual([
    ["freshmail1", false],
    ["old1", true],
    ["old2", true],
  ])
  expect(done.ok && done.aiEditTickets).toEqual([
    { book: "b1", key: "freshmail1", outcome: "open" },
    { book: "b1", key: "old1", outcome: "removed", cause: "limit" },
    { book: "b2", key: "old2", outcome: "removed", cause: "limit" },
  ])
})

test("利用者が消すと、反映していない提案だけが removed（cause user）を返す。反映した・失敗した提案と手紙は AI 編集チケットを直さない", () => {
  const { store } = ready()
  const s = store.state.getState()
  const mails: Mail[] = [
    mailRecord("applied", 1, PROPOSAL, proposalProps("b1", { appliedAt: "t" })),
    mailRecord("failed", 2, PROPOSAL, proposalProps("b1", { failedAt: "t", changed: [] })),
    mailRecord("letter", 3, LETTER, { title: "手紙", body: "" }),
    mailRecord("open", 4, PROPOSAL, proposalProps("b1")),
  ]
  const world = { ...s, records: { ...s.records, [MAIL.id]: Object.fromEntries(mails.map(m => [m.id, m])) } }
  const remove = (id: string) =>
    performIn(
      world as never,
      "@matomezu/base:mail-remove",
      {},
      { record: id },
      {
        catalog: CORE_CATALOG,
        controlCenter: "@matomezu/control-center:control-center" as never,
        lang: "ja",
        newId: () => "x",
        now: "t",
        actor: USER,
      },
    )
  for (const id of ["applied", "failed", "letter"]) {
    const done = remove(id)
    expect(done.ok).toBe(true)
    expect(done.ok && done.aiEditTickets).toBeUndefined()
  }
  expect(remove("open")).toMatchObject({
    ok: true,
    aiEditTickets: [{ book: "b1", key: "open", outcome: "removed", cause: "user" }],
  })
})
