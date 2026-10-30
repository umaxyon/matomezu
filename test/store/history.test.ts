// 画面の履歴: 利用者が画面で行ったアクションを、同じ処理の中のものは 1 つの画面の履歴の段にまとめて、ブックごとに覚える。元に戻す（undo）は画面の履歴の段が変えた所を前の値に、
// やり直す（redo）は後の値に置き直す（book-revert を同じ道で送る）。ロックの掛け外しは覚えない。新しい画面の履歴の段を入れると、そのブックのやり直せる画面の履歴の段は消える
import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { isEnabled } from "../../web/src/store/commands"
import { newStore } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
type Drawing = BookOf<"@matomezu/drawing:drawing">
const bookOf = (store: ReturnType<typeof newStore>, id = "b1") => store.state.getState().books[id] as Drawing
const itemsOf = (store: ReturnType<typeof newStore>, i = 0) => (bookOf(store).pages[i]?.items ?? []).map(x => x.id)
const historyOf = (store: ReturnType<typeof newStore>, id = "b1") => store.state.getState().history[id]
// 同じ処理が終わる（開いている画面の履歴の段が画面の履歴に入る）のを待つ
const settled = () => Promise.resolve()

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const place = (store: ReturnType<typeof newStore>, x: number, caption = "箱") =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: bookOf(store).pages[0]!.id, item: BOX, at: { x, y: 40 }, props: { caption } },
    { book: "b1" },
  )

test("箱を置いた画面の履歴の段を元に戻すと箱が消え、やり直すと同じ id の箱が同じ所に戻る", async () => {
  const store = ready()
  const before = itemsOf(store)
  expect(place(store, 40).ok).toBe(true)
  await settled()
  const placed = bookOf(store).pages[0]!.items!.at(-1)!
  expect(historyOf(store)?.undo).toHaveLength(1)
  expect(store.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  expect(itemsOf(store)).toEqual(before)
  expect(historyOf(store)?.redo).toHaveLength(1)
  expect(store.actions.command("s1", "@matomezu/base:redo")).toBe(true)
  expect(bookOf(store).pages[0]!.items!.at(-1)).toEqual(placed)
  expect(historyOf(store)).toMatchObject({ undo: [{}], redo: [] })
})

test("同じ処理の中で行ったアクションは 1 つの画面の履歴の段にまとまり、1 回の元に戻すで全部戻る", async () => {
  const store = ready()
  const before = itemsOf(store)
  place(store, 40, "1")
  place(store, 400, "2")
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(1)
  store.actions.command("s1", "@matomezu/base:undo")
  expect(itemsOf(store)).toEqual(before)
})

test("別の処理で行ったアクションは別の画面の履歴の段。コマンドを行う前にも画面の履歴の段を閉じる", async () => {
  const store = ready()
  place(store, 40, "1")
  await settled()
  place(store, 400, "2")
  // 同じ処理の中で戻す: すぐ前の操作の画面の履歴の段を閉じてから戻す
  store.actions.command("s1", "@matomezu/base:undo")
  expect(itemsOf(store)).toHaveLength(itemsOf(newStore()).length + 1)
  expect(historyOf(store)).toMatchObject({ undo: [{}], redo: [{}] })
})

test("新しい画面の履歴の段を入れると、そのブックのやり直せる画面の履歴の段は消える", async () => {
  const store = ready()
  place(store, 40)
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  expect(historyOf(store)?.redo).toHaveLength(1)
  place(store, 400)
  await settled()
  expect(historyOf(store)?.redo).toHaveLength(0)
  expect(isEnabled(store, store.state.getState(), "s1", "@matomezu/base:redo")).toBe(false)
})

test("ロックの掛け外しは画面の履歴に入らない。ロック中のブックでは元に戻すが押せない", async () => {
  const store = ready()
  place(store, 40)
  await settled()
  store.actions.perform("@matomezu/base:book-lock", {}, { book: "b1" })
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(1)
  expect(isEnabled(store, store.state.getState(), "s1", "@matomezu/base:undo")).toBe(false)
  store.actions.perform("@matomezu/base:book-unlock", {}, { book: "b1" })
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(1)
  expect(isEnabled(store, store.state.getState(), "s1", "@matomezu/base:undo")).toBe(true)
})

test("ロック中のページを変えた画面の履歴の段は、元に戻すとトーストで断り、画面の履歴の段は残る", async () => {
  const store = ready()
  place(store, 40)
  await settled()
  const page = bookOf(store).pages[0]!.id
  store.actions.perform("@matomezu/base:page-lock", { page }, { book: "b1" })
  expect(store.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn", message: "@matomezu/base:Locked" })
  expect(historyOf(store)).toMatchObject({ undo: [{}], redo: [] })
})

test("ページを消した画面の履歴の段を元に戻すと、同じ id のページが元の並びの所に戻り、そのページを開く", async () => {
  const store = ready()
  const pages = bookOf(store).pages.map(p => p.id)
  store.actions.perform("@matomezu/base:page-add", { title: "2 枚目" }, { book: "b1" })
  await settled()
  const added = bookOf(store).pages.at(-1)!.id
  store.actions.perform("@matomezu/base:page-remove", { page: pages[0]! }, { book: "b1" })
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  expect(bookOf(store).pages.map(p => p.id)).toEqual([...pages, added])
  expect(store.state.getState().workspace.stages[0]?.opened?.page).toBe(pages[0])
})

test("ブックの名前を変えた画面の履歴の段を戻すと、前の名前に戻る", async () => {
  const store = ready()
  const title = bookOf(store).title
  store.actions.perform("@matomezu/base:book-update", { title: "新しい名前" }, { book: "b1" })
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  expect(bookOf(store).title).toBe(title)
})

test("戻すまでの間に AI が変えた所は、画面の履歴の段が変えた所なら上書きし、そうでなければ残す。AI の変更は画面の履歴に入らない", async () => {
  const store = ready()
  place(store, 40, "1")
  await settled()
  const book = bookOf(store)
  const [page, ...rest] = book.pages
  const items = page!.items!.map((x, i, all) =>
    i === all.length - 1 ? { ...x, props: { ...x.props, caption: "AI" } } : x,
  )
  // AI の変更は常駐から知らされる（置いた箱のキャプションと、ブックの名前を変える）
  store.receive({ books: [{ ...book, title: "AI の名前", pages: [{ ...page!, items }, ...rest] }], settings: {} }, [])
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(1)
  store.actions.command("s1", "@matomezu/base:undo")
  expect(itemsOf(store)).toEqual(itemsOf(newStore()))
  expect(bookOf(store).title).toBe("AI の名前")
})

test("continueStep のあとに同じ処理で行ったアクションは、そのブックの最後の画面の履歴の段に足される。続けて何も変わらなければ画面の履歴の段ごと無くなる", async () => {
  const store = ready()
  const before = itemsOf(store)
  place(store, 40, "足した")
  await settled()
  const id = bookOf(store).pages[0]!.items!.at(-1)!.id
  const page = bookOf(store).pages[0]!.id
  store.actions.continueStep("b1")
  store.actions.perform("@matomezu/paper:item-update", { page, item: id, props: { caption: "書いた" } }, { book: "b1" })
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(1)
  store.actions.command("s1", "@matomezu/base:undo")
  expect(itemsOf(store)).toEqual(before)
  // ページを足して、続けてそのページを消すと、何も変わらないので画面の履歴の段は無くなる
  store.actions.perform("@matomezu/base:page-add", { title: "足した" }, { book: "b1" })
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(1)
  store.actions.continueStep("b1")
  store.actions.perform("@matomezu/base:page-remove", { page: bookOf(store).pages.at(-1)!.id }, { book: "b1" })
  await settled()
  expect(historyOf(store)?.undo).toHaveLength(0)
})
