// まだ見ていない、AI とほかの窓の変更: 常駐の知らせ（receive の change）のうち、この窓のでない物は、まだ見ていない画面の履歴の段として溜め、
// 変えた物がどこかのステージで見えたら、そのブックの画面の履歴に時刻の位置で差し込む（やり直せる画面の履歴の段は消さない）。
// ビューが物の見え方を知らせなければ、開いているページの変更は見えたとする。まだ見ていない変更と同じ所を置き直す戻す・やり直すは断り、その変更は残る

import { expect, test } from "bun:test"
import { z } from "zod"
import { pagesOf } from "../../web/src/core/book"
import { defineAction } from "../../web/src/core/def/action"
import type { Book } from "../../web/src/core/schema/book"
import { definePlugin } from "../../web/src/store/plugin"
import type { AIEditTicketOutcome } from "../../web/src/store/state"
import { newStore, sequence, worldRows } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
type Drawing = Book
type Store = ReturnType<typeof newStore>
const bookOf = (store: Store) => store.state.getState().books.b1 as Drawing
const historyOf = (store: Store) => store.state.getState().history.b1
const settled = () => Promise.resolve()

// 常駐に確かめられた世界（この窓の変更が確かめられたあと）。最初の知らせで、よその変更の前の値になる
function ready(clock?: () => string, aiEditTicket?: (c: AIEditTicketOutcome) => void) {
  const store = newStore({ ...(clock ? { now: clock } : {}), ...(aiEditTicket ? { aiEditTicket } : {}) })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.receive({ ...worldRows([bookOf(store)]), settings: {} }, [])
  return store
}
const place = (store: Store, caption: string, x = 40) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { item: BOX, at: { x, y: 40 }, props: { caption } },
    { page: pagesOf(bookOf(store))[0]!.id },
  )
const confirm = (store: Store) => store.receive({ ...worldRows([bookOf(store)]), settings: {} }, [])
// よその変更: 確かめた世界のブックを change で変えたものが届く
const foreign = (
  store: Store,
  book: Book,
  by: "ai" | "window" | "host" = "ai",
  act = "1",
  action = "@matomezu/paper:item-update",
) => store.receive({ ...worldRows([book]), settings: {} }, [], { books: [book.id], by, act, actions: [action] })
const renamed = (book: Drawing, i: number, caption: string): Drawing =>
  ({
    ...book,
    lineup: pagesOf(book).map((p, k) =>
      k === 0 ? { ...p, items: p.items?.map((x, j) => (j === i ? { ...x, props: { ...x.props, caption } } : x)) } : p,
    ),
  }) as Drawing
// ステージの表示領域を、紙の左上の角の外の小さな所にする（どの形の頭も見えない）・元の広さに戻す
const hide = (store: Store) => store.actions.resizeStage("s1", { w: 1, h: 1 })
const show = (store: Store) => store.actions.resizeStage("s1", { w: 1400, h: 1000 })
const captions = (store: Store) =>
  (pagesOf(bookOf(store))[0]?.items ?? []).map(x => (x.props as { caption?: string }).caption)

test("開いているページの AI の変更は、すぐ画面の履歴に入り、時刻の新しい方から戻る（AI の変更が先に戻る）", async () => {
  const store = ready(sequence())
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (pagesOf(bookOf(store))[0]?.items?.length ?? 0) - 1
  foreign(store, renamed(bookOf(store), last, "AI"))
  expect(historyOf(store)?.undo).toHaveLength(2)
  expect(historyOf(store)?.undo.at(-1)?.by).toBe("ai")
  store.actions.command("s1", "@matomezu/base:undo")
  expect(captions(store).at(-1)).toBe("自分")
  store.actions.command("s1", "@matomezu/base:undo")
  expect(captions(store)).not.toContain("自分")
})

test("見える所に無い物の変更は溜めておき、見えたら時刻の位置に差し込む。やり直せる画面の履歴の段は消さない", async () => {
  const store = ready(sequence())
  hide(store)
  place(store, "1")
  await settled()
  confirm(store)
  foreign(store, renamed(bookOf(store), 0, "AI"))
  expect(historyOf(store)?.undo).toHaveLength(1)
  expect(place(store, "2", 400).ok).toBe(true)
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  expect(historyOf(store)?.redo).toHaveLength(1)
  show(store)
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user", "ai"])
  expect(historyOf(store)?.redo).toHaveLength(1)
})

test("開いていないページの変更は、そのページを開いたら見えたとする", async () => {
  const store = ready(sequence())
  const book = bookOf(store)
  store.actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "2" }, { book: "b1" })
  await settled()
  confirm(store)
  const [, second] = pagesOf(bookOf(store))
  store.actions.openPage("s1", pagesOf(book)[0]!.id)
  const now = bookOf(store)
  foreign(store, { ...now, lineup: now.lineup.map(p => (p.id === second!.id ? { ...p, title: "AI" } : p)) })
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user"])
  store.actions.openPage("s1", second!.id)
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user", "ai"])
})

test("まだ見ていない変更と同じ所を戻すと断り、自分の段を捨てる。その変更は残り、見えたら差し込む", async () => {
  const store = ready(sequence())
  hide(store)
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (pagesOf(bookOf(store))[0]?.items?.length ?? 0) - 1
  foreign(store, renamed(bookOf(store), last, "AI"))
  store.actions.command("s1", "@matomezu/base:undo")
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  expect(pagesOf(bookOf(store))[0]?.items?.[last]?.props).toMatchObject({ caption: "AI" })
  show(store)
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["ai"])
})

test("常駐が自分で行った変更と、画面の履歴に入れないアクションの変更は入れない。ほかの窓の変更は AI の変更と同じに扱う", () => {
  const store = ready(sequence())
  foreign(store, { ...bookOf(store), title: "組み直し" }, "host")
  foreign(store, { ...bookOf(store), locked: true } as Book, "window", "3", "@matomezu/base:book-lock")
  expect(historyOf(store)).toBeUndefined()
  foreign(store, { ...bookOf(store), title: "ほかの窓" }, "window", "7")
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["window"])
})

test("プラグインを組み直したあとは、よその変更を画面の履歴に入れるかを、組み直した機能台帳のアクションで決める", () => {
  const store = ready(sequence())
  // 取り込んだ追加プラグインの、画面の履歴に入れないアクション（組み直す前の機能台帳には無い）
  const quiet = defineAction({
    id: "quiet:retitle",
    title: "@matomezu/drawing:Drawing",
    aiDescription: "Retitle a book without entering the history.",
    target: "book",
    permissionScope: "book",
    history: false,
    args: z.strictObject({ title: z.string().min(1) }),
    run: (book, args) => ({ next: { ...book, title: args.title }, result: {} }),
  })
  store.use([definePlugin({ id: "quiet", actions: [quiet] })])
  show(store)
  confirm(store)
  foreign(store, { ...bookOf(store), title: "履歴に入れない" }, "window", "1", "quiet:retitle")
  expect(historyOf(store)).toBeUndefined()
  foreign(store, { ...bookOf(store), title: "ほかの窓" }, "window", "2")
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["window"])
})

test("AI の変更が見えたら seen を知らせる。見られる前の AI の変更と同じ所を戻すと断るので、lost は知らせない。ほかの窓の変更は知らせない", async () => {
  const told: AIEditTicketOutcome[] = []
  const store = ready(sequence(), c => told.push(c))
  hide(store)
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (pagesOf(bookOf(store))[0]?.items?.length ?? 0) - 1
  const item = pagesOf(bookOf(store))[0]!.items![last]!.id
  foreign(store, renamed(bookOf(store), last, "AI"), "ai", "5")
  store.actions.command("s1", "@matomezu/base:undo")
  show(store)
  // ブックのフィールドの変更は、ブックを開いていればすぐ見えた（ほかの窓の物は知らせない）
  foreign(store, { ...bookOf(store), title: "窓の題" }, "window", "6")
  foreign(store, { ...bookOf(store), title: "AI の題" }, "ai", "7")
  const page = pagesOf(bookOf(store))[0]!.id
  expect(told).toEqual([
    { act: "5", places: [page], outcome: "seen" },
    { act: "7", places: ["b1"], outcome: "seen" },
  ])
  expect(pagesOf(bookOf(store))[0]?.items?.find(i => i.id === item)).toBeDefined()
})

test("戻すが消したのでなく、ふつうの操作のあとに戻して AI の値に戻ったなら、捨てずに知らせない", async () => {
  const told: AIEditTicketOutcome[] = []
  const store = ready(sequence(), c => told.push(c))
  hide(store)
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (pagesOf(bookOf(store))[0]?.items?.length ?? 0) - 1
  const item = pagesOf(bookOf(store))[0]!.items![last]!.id
  const page = pagesOf(bookOf(store))[0]!.id
  foreign(store, renamed(bookOf(store), last, "AI"), "ai", "5")
  store.actions.perform("@matomezu/paper:item-update", { item, props: { caption: "打ち直し" } }, { page })
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  expect(captions(store).at(-1)).toBe("AI")
  expect(told).toEqual([])
  show(store)
  expect(told).toEqual([{ act: "5", places: [page], outcome: "seen" }])
})

test("窓が見えていない間は、見えたとしない。見えるようになって確かめ直したら差し込む", () => {
  let visible = false
  const store = newStore({ now: sequence(), visible: () => visible })
  store.receive({ ...worldRows([bookOf(store)]), settings: {} }, [])
  foreign(store, { ...bookOf(store), title: "AI" })
  expect(historyOf(store)).toBeUndefined()
  visible = true
  store.checkSeen()
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["ai"])
})

test("AI の 1 回の操作が何冊も変えたら、見えたブックの画面の履歴にだけ、そのブックの分が入る", () => {
  const store = newStore({ now: sequence() })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  let world = { b1: bookOf(store), b2: store.state.getState().books.b2 as Drawing }
  store.receive({ ...worldRows(Object.values(world)), settings: {} }, [])
  const change = (book: Drawing) => {
    world = { ...world, [book.id]: book }
    store.receive({ ...worldRows(Object.values(world)), settings: {} }, [], {
      books: [book.id],
      by: "ai",
      act: "9",
      actions: ["@matomezu/base:book-update"],
    })
  }
  change({ ...world.b2, title: "AI" })
  change({ ...world.b1, title: "AI" })
  expect(historyOf(store)?.undo.map(s => s.books)).toEqual([["b1"]])
  expect(store.state.getState().history.b2).toBeUndefined()
})

test("AI がほかのページを足しただけなら、開いているページでは見えたとしない。足したページを開いたら見えた", async () => {
  const told: AIEditTicketOutcome[] = []
  const store = ready(sequence(), c => told.push(c))
  const now = bookOf(store)
  const first = pagesOf(now)[0]!
  foreign(store, { ...now, lineup: [...now.lineup, { ...first, id: "p-ai", title: "AI" }] } as Book, "ai", "4")
  expect(historyOf(store)).toBeUndefined()
  store.actions.openPage("s1", "p-ai")
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["ai"])
  expect(told).toEqual([{ act: "4", places: ["p-ai", "b1"], outcome: "seen" }])
})

test("AI がページの並びの順だけを変えたら、ブックを開いていればすぐ見えた", async () => {
  const store = ready(sequence())
  store.actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "2" }, { book: "b1" })
  await settled()
  confirm(store)
  const now = bookOf(store)
  foreign(store, { ...now, lineup: [...now.lineup].reverse() } as Book, "window", "8")
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user", "window"])
})

test("見られる前の AI の変更を、画面の履歴に入れない利用者の変更が上書きしたら、消えた所と AI の値を、ブックの名前で知らせる", async () => {
  const told: AIEditTicketOutcome[] = []
  let visible = false
  const store = newStore({ now: sequence(), visible: () => visible, aiEditTicket: c => told.push(c) })
  store.receive({ ...worldRows([bookOf(store)]), settings: {} }, [])
  const flow = "@matomezu/base:print-preview-flow"
  foreign(store, { ...bookOf(store), settings: { [flow]: "row" } } as Book, "ai", "6", "@matomezu/base:book-update")
  const done = store.actions.perform(
    "@matomezu/base:print-preview-update",
    { settings: { [flow]: "column" } },
    {
      book: "b1",
    },
  )
  expect(done.ok).toBe(true)
  await settled()
  expect(told).toEqual([
    { book: "b1", act: "6", places: ["b1"], outcome: "lost", lost: [{ at: "settings", value: { [flow]: "row" } }] },
  ])
  visible = true
  store.checkSeen()
  expect(historyOf(store)).toBeUndefined()
})
