// 画面の履歴と、バインダの中のページ: 画面の履歴の段を戻すあいだに、よそでバインダごと変わっていたときの置き直し（段が書いた所が変わっていれば断る）と、
// バインダの中のページの AI の変更と重なる置き直し

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import type { Book } from "../../web/src/core/schema/book"
import { shownPageId } from "../../web/src/core/stage"
import { screenOf } from "../../web/src/core/window"
import type { AIEditTicketOutcome } from "../../web/src/store/store"
import { drawingPage, SLIDE, testBinder, testBook, testPage, withSlide } from "../lineup"
import { newStore, sequence, worldRows } from "../support"

const TEXT = "@matomezu/slide:slide-text"
type Store = ReturnType<typeof newStore>
const slidePage = (id: string) => withSlide(testPage(SLIDE, id, { title: id, paper: "@matomezu/base:ratio-16x9" }), [])
// スライドのバインダ bd に、ページ pages を入れたブック b1
const slides = (...pages: string[]) =>
  testBook("b1", "スライド", [testBinder("bd", "スライド", SLIDE, ...pages.map(slidePage))])
const bookOf = (store: Store) => store.state.getState().books.b1 as Book
const pageIds = (store: Store) => pagesOf(bookOf(store)).map(p => p.id)
const settled = () => Promise.resolve()

function ready(book: Book, aiEditTicket?: (c: AIEditTicketOutcome) => void) {
  const store = newStore({ books: [book], now: sequence(), ...(aiEditTicket ? { aiEditTicket } : {}) })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.receive({ ...worldRows([bookOf(store)]), settings: {} }, [])
  return store
}
const confirm = (store: Store) => store.receive({ ...worldRows([bookOf(store)]), settings: {} }, [])
const foreign = (store: Store, book: Book, action: string, act = "1", by: "ai" | "host" = "ai") =>
  store.receive({ ...worldRows([book]), settings: {} }, [], { books: [book.id], by, act, actions: [action] })
const shown = (store: Store) => shownPageId(screenOf(store.state.getState().window).stages[0]?.opened ?? null)

test("バインダからページを消した画面の履歴の段は、よそでバインダごと無くなっていたら、戻してもページは戻らない", async () => {
  const store = ready(slides("p1", "p2"))
  expect(store.actions.perform("@matomezu/base:page-remove", { page: "p2" }, { book: "b1" }).ok).toBe(true)
  await settled()
  confirm(store)
  expect(pageIds(store)).toEqual(["p1"])
  // よそで、バインダごと無くなる（代わりに図のページが 1 枚）
  foreign(store, testBook("b1", "スライド"), "@matomezu/base:page-remove")
  store.actions.command("s1", "@matomezu/base:undo")
  expect(bookOf(store).lineup.map(e => e.id)).toEqual(["p1"])
  expect(bookOf(store).lineup.map(e => e.kind)).toEqual(["page"])
})

test("バインダを作った画面の履歴の段は、よそがそのバインダにページを足していたら、ぶつかって戻せず、足したページは残る", async () => {
  const store = ready(testBook("b1", "スライド"))
  expect(
    store.actions.perform(
      "@matomezu/base:page-add",
      { type: SLIDE, title: "1", into: { newBinder: "スライド" } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  await settled()
  confirm(store)
  const now = bookOf(store)
  const binder = now.lineup.find(e => e.kind === "binder")
  if (binder?.kind !== "binder") throw new Error("no binder")
  // よそで、そのバインダにページ p9 が足される（開いていないページなので、まだ見ていない変更のまま）
  foreign(
    store,
    {
      ...now,
      lineup: now.lineup.map(e => (e === binder ? { ...binder, lineup: [...binder.lineup, slidePage("p9")] } : e)),
    },
    "@matomezu/base:page-add",
  )
  expect(pageIds(store)).toContain("p9")
  store.actions.command("s1", "@matomezu/base:undo")
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  expect(bookOf(store).lineup.map(e => e.kind)).toEqual(["page", "binder"])
  expect(pageIds(store)).toContain("p9")
  expect(store.state.getState().history.b1?.undo ?? []).toEqual([])
})

test("バインダの中のページで、自分が置いた物を AI が見られる前に書き換えていたら、置いたのを戻せず、AI の変更は残る（消えたと知らせない）", async () => {
  const told: AIEditTicketOutcome[] = []
  const store = ready(slides("p1", "p2"), c => told.push(c))
  store.actions.openPage("s1", "p1")
  const placed = store.actions.perform(
    "@matomezu/slide:slide-place",
    { item: TEXT, at: { x: 10, y: 20 }, props: { text: "自分" } },
    { page: "p2" },
  )
  expect(placed.ok).toBe(true)
  await settled()
  confirm(store)
  const now = bookOf(store)
  const item = (pagesOf(now)[1] as { slide?: { id: string }[] }).slide?.[0]?.id as string
  const rewritten = (p: unknown) => {
    const page = p as { id: string; slide?: { id: string; props?: object }[] }
    return page.id === "p2"
      ? { ...page, slide: page.slide?.map(x => ({ ...x, props: { ...x.props, text: "AI" } })) }
      : page
  }
  foreign(
    store,
    {
      ...now,
      lineup: now.lineup.map(e => (e.kind === "binder" ? { ...e, lineup: e.lineup.map(rewritten) } : e)),
    } as Book,
    "@matomezu/slide:slide-update",
    "5",
  )
  store.actions.command("s1", "@matomezu/base:undo")
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  const slide = (pagesOf(bookOf(store))[1] as { slide?: { id: string; props?: { text?: string } }[] }).slide ?? []
  expect(slide.find(x => x.id === item)?.props?.text).toBe("AI")
  expect(told.filter(t => t.outcome === "lost")).toEqual([])
})

test("バインダからページを消した画面の履歴の段は、よそでバインダが別のページに替わっていたら、ぶつかって戻せず、ページは戻らない", async () => {
  const store = ready(slides("p1", "p2"))
  expect(store.actions.perform("@matomezu/base:page-remove", { page: "p2" }, { book: "b1" }).ok).toBe(true)
  await settled()
  confirm(store)
  // よそで、バインダが無くなり、図のページ d1 に替わる（常駐が自分で行った物として届く）
  foreign(store, testBook("b1", "スライド", [drawingPage("d1")]), "@matomezu/base:page-remove", "1", "host")
  store.actions.command("s1", "@matomezu/base:undo")
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  expect(bookOf(store).lineup.map(e => e.id)).toEqual(["d1"])
})

test("バインダの中のページを変えた画面の履歴の段を戻すと、そのページを開く", async () => {
  const store = ready(slides("p1", "p2"))
  store.actions.openPage("s1", "p1")
  expect(
    store.actions.perform(
      "@matomezu/slide:slide-place",
      { item: TEXT, at: { x: 10, y: 20 }, props: { text: "自分" } },
      { page: "p2" },
    ).ok,
  ).toBe(true)
  await settled()
  confirm(store)
  expect(shown(store)).toBe("p1")
  store.actions.command("s1", "@matomezu/base:undo")
  expect(shown(store)).toBe("p2")
})
