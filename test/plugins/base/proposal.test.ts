// 変更提案郵便（base の郵便の種類 proposal）: 送るときに乗せた変更を試し、当たる物の値を郵便にしまう。反映は乗せた変更を順に 1 つのアクションで行い、
// 送ったあとに当たる物が変わっていたら断る。反映した・失敗したは郵便に一度だけ残す

import { expect, test } from "bun:test"
import { AI } from "../../../web/src/core/actor"
import type { Mail } from "../../../web/src/core/mail"
import { performIn } from "../../../web/src/core/perform"
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
    on?: { book: string },
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
  const mail = (): Mail => store.state.getState().mailbox.at(-1) as Mail
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
    expect(perform(SETTLE, { mail: mail().id, outcome: "applied" }).ok).toBe(true)
    expect(mail().props).toMatchObject({ appliedAt: expect.any(String) })
    expect(perform(SETTLE, { mail: mail().id, outcome: "failed" }).ok).toBe(false)
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
  const settle = performIn(world as never, SETTLE, { mail: "m", outcome: "applied" }, undefined, ctx)
  expect(settle).toMatchObject({ ok: false })
})
