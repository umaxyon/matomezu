// 郵便箱のスクリーン（base/mail/screen.ts）: ブックスクリーンから開けば下の段に出し、郵便を渡せばそのタブに替えて選び、見たことにする。
// 書庫のスクリーンが下の段にあれば入れ替え、閉じればブックスクリーンだけに戻す（ユーザーが分けて足した空のステージは閉じない）。↑↓で選ぶ行を移す

import { expect, test } from "bun:test"
import type { WindowState } from "../../../web/src/core/window"
import { MAIL, mailboxOf } from "../../../web/src/plugins/base/mail"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"
import { MAILBOX_PICKED, MAILBOX_SENDER_TAB } from "../../../web/src/plugins/base/mail/states"
import { bookStageAbove, showBookAbove } from "../../../web/src/plugins/base/window/below-book"
import { NO_STAGE } from "../../../web/src/store/dialogs"
import { pluginValueOf } from "../../../web/src/store/plugin-state"
import { SAMPLE_BOOKS } from "../../sample-books"
import { NO_BOOK_SCREEN, newStore, showFirstBook, worldRows } from "../../support"

const MAILBOX = "@matomezu/base:mailbox-screen"
const LIBRARY = "@matomezu/base:library-screen"

// 郵便箱のスクリーン mailbox から行き先を開く起点のステージ（郵便箱の画面と同じ読み方）
const startStage = (win: WindowState, mailbox: string) =>
  bookStageAbove(
    win.screens.map(s => ({ id: s.id, currentStage: s.stages?.current ?? NO_STAGE })),
    win.arrangementValue,
    mailbox,
  )

const letter = (title: string, senderKind: Mail["senderKind"], order: number): Mail => ({
  id: title,
  mail: "@matomezu/base:letter",
  senderKind,
  from: senderKind === "ai" ? "claude" : "masa",
  sentAt: "2026-11-24T00:00:00.000Z",
  props: { title, body: "" },
  order,
})

function setup() {
  // 届いた順に a1（AI）・u1（人）・a2（AI）
  const mails = [letter("a1", "ai", 1), letter("u1", "user", 2), letter("a2", "ai", 3)]
  const store = newStore({ bookScreen: NO_BOOK_SCREEN })
  const { state, actions } = store
  store.receive(
    {
      ...worldRows(SAMPLE_BOOKS),
      settings: {},
      records: { [MAIL.id]: Object.fromEntries(mails.map(m => [m.id, m])) },
    },
    [],
  )
  showFirstBook(store)
  const id: Record<string, string> = { a1: "a1", u1: "u1", a2: "a2" }
  const win = () => state.getState().window
  const of = (def: string) => win().screens.find(s => s.def === def)?.id ?? ""
  const run = (at: string, id: string, args?: unknown) =>
    (actions.command as (at: string, id: string, ...args: unknown[]) => boolean)(
      at,
      `@matomezu/base:${id}`,
      ...(args === undefined ? [] : [args]),
    )
  const picked = () => pluginValueOf(state.getState().pluginValues, of(MAILBOX), MAILBOX_PICKED)
  const tab = () => pluginValueOf(state.getState().pluginValues, of(MAILBOX), MAILBOX_SENDER_TAB)
  const seen = (title: string) => !!mailboxOf(state.getState().records).find(m => m.id === id[title])?.seenAt
  const stages = () => win().screens.flatMap(s => s.stages?.stages ?? [])
  return { store, win, of, run, picked, tab, seen, stages, id }
}

test("ブックスクリーンから郵便を渡して開く: 下の段に出し、その郵便のタブに替えて選び、見たことにする。行き先の起点は上のカレントのステージ", () => {
  const { win, of, run, picked, tab, seen, id } = setup()
  const book = win().screens.find(s => s.stages !== undefined)?.id ?? ""
  expect(run("s1", "mailbox-open", { mail: id.u1 })).toBe(true)
  expect(win().arrangement).toBe("@matomezu/base:split-rows")
  expect(win().arrangementValue).toMatchObject({ screens: [book, of(MAILBOX)] })
  expect([tab(), picked(), seen("u1"), seen("a2")]).toEqual(["user", id.u1, true, false])
  expect(startStage(win(), of(MAILBOX))).toBe("s1")
  // 渡さずに開き直すと、何も選ばない（タブはそのまま）
  run(of(MAILBOX), "mailbox-open")
  expect([tab(), picked()]).toEqual(["user", undefined])
})

test("↑↓: 今のタブの行（新しい順）を移して選び、見たことにする", () => {
  const { of, run, picked, seen, id } = setup()
  run("s1", "mailbox-open")
  const mailbox = of(MAILBOX)
  run(mailbox, "mailbox-pick-move", { to: "down" })
  expect([picked(), seen("a2")]).toEqual([id.a2, true])
  run(mailbox, "mailbox-pick-move", { to: "down" })
  expect([picked(), seen("a1")]).toEqual([id.a1, true])
  run(mailbox, "mailbox-pick-move", { to: "down" })
  expect(picked()).toBe(id.a1)
})

test("書庫が下の段にあれば入れ替える。閉じるとブックスクリーンだけに戻り、分けて足した空のステージは残る", () => {
  const { win, of, run, stages, id } = setup()
  const book = win().screens.find(s => s.stages !== undefined)?.id ?? ""
  // 「画面を分割」: 空のステージを足し、下の段に書庫
  run("s1", "stage-split")
  expect(stages()).toHaveLength(2)
  const library = of(LIBRARY)
  expect(win().arrangementValue).toMatchObject({ screens: [book, library] })
  // 書庫のスクリーンから郵便箱を開く: 下の段が郵便箱に替わり、書庫は開いたまま後ろへ
  run(library, "mailbox-open", { mail: id.a1 })
  expect(win().arrangementValue).toMatchObject({ screens: [book, of(MAILBOX)] })
  expect(of(LIBRARY)).toBe(library)
  expect(run(of(MAILBOX), "mailbox-screen-close")).toBe(true)
  expect(of(MAILBOX)).toBe("")
  expect(win().arrangement).toBe("@matomezu/base:one-screen")
  expect(win().order.at(-1)).toBe(book)
  expect(stages()).toHaveLength(2)
})

test("コントロールセンター（定義に mailboxArea を書いた）から開く: 郵便箱のスクリーンは開かず、そのスクリーンの郵便箱の画面で選ぶ", () => {
  const { store, win, of, run, id } = setup()
  const center = win().screens.find(s => s.stages === undefined)?.id ?? ""
  store.actions.makeScreenCurrent(center)
  run(center, "mailbox-open", { mail: id.u1 })
  expect(of(MAILBOX)).toBe("")
  const values = store.state.getState().pluginValues
  expect([pluginValueOf(values, center, MAILBOX_SENDER_TAB), pluginValueOf(values, center, MAILBOX_PICKED)]).toEqual([
    "user",
    id.u1,
  ])
})

test("下の段の「開く」: 上の段を行き先のブックのブックスクリーンに替え、見ていたブックスクリーンは開いたまま後ろへ。下の段の郵便箱はそのまま", () => {
  const { store, win, of, run } = setup()
  const book = win().screens.find(s => s.stages !== undefined)?.id ?? ""
  run("s1", "mailbox-open")
  const mailbox = of(MAILBOX)
  const other = SAMPLE_BOOKS[1]?.id ?? ""
  const stage = showBookAbove(store.actions, () => store.state.getState().window, mailbox, other)
  expect(stage).not.toBe(NO_STAGE)
  const added = win().screens.find(s => s.stages?.stages.some(st => st.id === stage))?.id
  expect(added).not.toBe(book)
  expect(win().arrangementValue).toMatchObject({ screens: [added, mailbox] })
  expect(win().screens.some(s => s.id === book)).toBe(true)
})
