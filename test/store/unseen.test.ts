// まだ見ていない、AI とほかの窓の変更: 常駐の知らせ（receive の change）のうち、この窓のでない物は、まだ見ていない画面の履歴の段として溜め、
// 変えた物がどこかのステージで見えたら、そのブックの画面の履歴に時刻の位置で差し込む（やり直せる画面の履歴の段は消さない）。
// ビューが物の見え方を知らせなければ、開いているページの変更は見えたとする。戻す・やり直すが上書きした、まだ見ていない変更は捨てる
import { expect, test } from "bun:test"
import type { Book, BookOf } from "../../web/src/core/schema/book"
import type { AIChangeOutcome } from "../../web/src/store/store"
import { newStore, sequence } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
type Drawing = BookOf<"@matomezu/drawing:drawing">
type Store = ReturnType<typeof newStore>
const bookOf = (store: Store) => store.state.getState().books.b1 as Drawing
const historyOf = (store: Store) => store.state.getState().history.b1
const settled = () => Promise.resolve()

// 常駐に確かめられた世界（この窓の変更が確かめられたあと）。最初の知らせで、よその変更の前の値になる
function ready(clock?: () => string, aiChange?: (c: AIChangeOutcome) => void) {
  const store = newStore({ ...(clock ? { now: clock } : {}), ...(aiChange ? { aiChange } : {}) })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.receive({ books: [bookOf(store)], settings: {} }, [])
  return store
}
const place = (store: Store, caption: string, x = 40) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: bookOf(store).pages[0]!.id, item: BOX, at: { x, y: 40 }, props: { caption } },
    { book: "b1" },
  )
const confirm = (store: Store) => store.receive({ books: [bookOf(store)], settings: {} }, [])
// よその変更: 確かめた世界のブックを change で変えたものが届く
const foreign = (store: Store, book: Book, by: "ai" | "window" | "host" = "ai", act = "1") =>
  store.receive({ books: [book], settings: {} }, [], { book: book.id, by, act })
const renamed = (book: Drawing, i: number, caption: string): Drawing =>
  ({
    ...book,
    pages: book.pages.map((p, k) =>
      k === 0 ? { ...p, items: p.items?.map((x, j) => (j === i ? { ...x, props: { ...x.props, caption } } : x)) } : p,
    ),
  }) as Drawing
const captions = (store: Store) =>
  (bookOf(store).pages[0]?.items ?? []).map(x => (x.props as { caption?: string }).caption)

test("開いているページの AI の変更は、すぐ画面の履歴に入り、時刻の新しい方から戻る（AI の変更が先に戻る）", async () => {
  const store = ready(sequence())
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (bookOf(store).pages[0]?.items?.length ?? 0) - 1
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
  let shown = false
  store.setSeenTest("s1", () => shown)
  place(store, "1")
  await settled()
  confirm(store)
  foreign(store, renamed(bookOf(store), 0, "AI"))
  expect(historyOf(store)?.undo).toHaveLength(1)
  expect(place(store, "2", 400).ok).toBe(true)
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  expect(historyOf(store)?.redo).toHaveLength(1)
  shown = true
  store.setSeenTest("s1", () => shown)
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user", "ai"])
  expect(historyOf(store)?.redo).toHaveLength(1)
})

test("開いていないページの変更は、そのページを開いたら見えたとする", async () => {
  const store = ready(sequence())
  const book = bookOf(store)
  store.actions.perform("@matomezu/base:page-add", { title: "2" }, { book: "b1" })
  await settled()
  confirm(store)
  const [, second] = bookOf(store).pages
  store.actions.openPage("s1", book.pages[0]!.id)
  const now = bookOf(store)
  foreign(store, { ...now, pages: now.pages.map(p => (p.id === second!.id ? { ...p, title: "AI" } : p)) })
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user"])
  store.actions.openPage("s1", second!.id)
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["user", "ai"])
})

test("戻すが上書きした、まだ見ていない変更は捨てる（あとで見えても差し込まない）。ほかの所の変更は残る", async () => {
  const store = ready(sequence())
  store.setSeenTest("s1", () => false)
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (bookOf(store).pages[0]?.items?.length ?? 0) - 1
  foreign(store, renamed(bookOf(store), last, "AI"))
  store.actions.command("s1", "@matomezu/base:undo")
  store.setSeenTest("s1", () => true)
  expect(historyOf(store)?.undo ?? []).toEqual([])
})

test("常駐が自分で行った変更は画面の履歴に入れない。ほかの窓の変更は AI の変更と同じに扱う", () => {
  const store = ready(sequence())
  foreign(store, { ...bookOf(store), title: "組み直し" }, "host")
  expect(historyOf(store)).toBeUndefined()
  foreign(store, { ...bookOf(store), title: "ほかの窓" }, "window", "7")
  expect(historyOf(store)?.undo.map(s => s.by)).toEqual(["window"])
})

test("AI の変更が見えたら seen を、見られる前に戻すが上書きしたら、AI が書いた所と値を添えて lost を知らせる。ほかの窓の変更は知らせない", async () => {
  const told: AIChangeOutcome[] = []
  const store = ready(sequence(), c => told.push(c))
  store.setSeenTest("s1", () => false)
  place(store, "自分")
  await settled()
  confirm(store)
  const last = (bookOf(store).pages[0]?.items?.length ?? 0) - 1
  const item = bookOf(store).pages[0]!.items![last]!.id
  foreign(store, renamed(bookOf(store), last, "AI"), "ai", "5")
  foreign(store, renamed(bookOf(store), 0, "窓"), "window", "6")
  store.actions.command("s1", "@matomezu/base:undo")
  store.setSeenTest("s1", () => true)
  // ブックのフィールドの変更は、ブックを開いていればすぐ見えた
  foreign(store, { ...bookOf(store), title: "AI の題" }, "ai", "7")
  const page = bookOf(store).pages[0]!.id
  expect(told).toEqual([
    { book: "b1", act: "5", outcome: "lost", lost: [{ at: `pages/${page}/items/${item}/props/caption`, value: "AI" }] },
    { book: "b1", act: "7", outcome: "seen" },
  ])
})
