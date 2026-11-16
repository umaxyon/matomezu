// 画面の履歴と、バインダの中のページ: 画面の履歴の段を戻すあいだに、よそでバインダごと変わっていたときの置き直しと、
// バインダの中のページの、見られる前に消えた AI の変更の知らせ

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import type { Book } from "../../web/src/core/schema/book"
import type { AIEditTicketOutcome } from "../../web/src/store/store"
import { SLIDE, testBinder, testBook, testPage, withSlide } from "../lineup"
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
const foreign = (store: Store, book: Book, action: string, act = "1") =>
  store.receive({ ...worldRows([book]), settings: {} }, [], { books: [book.id], by: "ai", act, action })

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

test("バインダを作った画面の履歴の段を戻すと、よそがそのバインダに足したページごと無くなる", async () => {
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
  expect(bookOf(store).lineup.map(e => e.kind)).toEqual(["page"])
  expect(pageIds(store)).not.toContain("p9")
})

test("バインダの中のページの AI の変更が、見られる前に戻すで消えたら、バインダをたどった道で知らせる", async () => {
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
  expect(told).toEqual([
    {
      book: "b1",
      act: "5",
      places: ["p2"],
      outcome: "lost",
      lost: [{ at: `lineup/bd/lineup/p2/slide/${item}/props/text`, value: "AI" }],
    },
  ])
})
