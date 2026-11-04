// 伝言（base のアノテーションの種類）: ブックのデータとは別に持ち、付ける・変える・消すのは利用者だけで、AI は読んだと知らせるだけ。
// ロック中のブックにも付けられ、画面の履歴に入らず、アンカーの物が全部無くなると消える
import { expect, test } from "bun:test"
import type { Annotation } from "../../web/src/core/annotation"
import { performIn } from "../../web/src/core/perform"
import type { BookOf } from "../../web/src/core/schema/book"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { CORE_CATALOG, newStore } from "../support"

type Drawing = BookOf<"@matomezu/drawing:drawing">
const ON = { book: "b1" }

// 見本のブック b1 の最初のページに箱を 2 つ置いた store
function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const page = (store.state.getState().books.b1 as Drawing).pages[0]!.id
  const place = (x: number) =>
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page, item: "@matomezu/box:shape-nest-box", at: { x, y: 40 }, props: { caption: "箱" } },
      ON,
    )
  const [a, b] = [place(40), place(400)].map(done => (done.ok ? (done.result as { item: string }).item : "")) as [
    string,
    string,
  ]
  const notes = (): readonly Annotation[] => store.state.getState().annotations.b1 ?? []
  return { store, page, a, b, notes }
}

const ADD = "@matomezu/base:note-add"
const UPDATE = "@matomezu/base:note-update"
const READ = "@matomezu/base:note-read"
const REMOVE = "@matomezu/base:note-remove"

test("伝言を付けると、ブックとは別に持ち、id を返す。吹き出しは既定で出す。文が空か空白だけなら付けない（文の無い印はマーク）", () => {
  const { store, a, b, notes } = ready()
  const before = store.state.getState().books.b1
  const done = store.actions.perform(ADD, { anchors: [a, b], text: "見て" }, ON)
  expect(done).toMatchObject({ ok: true, result: { note: expect.any(String) } })
  expect(store.state.getState().books.b1).toBe(before)
  expect(notes()).toEqual([
    {
      id: done.ok ? (done.result as { note: string }).note : "",
      annotation: "@matomezu/base:note",
      anchors: [a, b],
      props: { text: "見て", bubble: true },
    },
  ])
  expect(store.actions.perform(ADD, { anchors: [a], text: "" }, ON).ok).toBe(false)
  expect(store.actions.perform(ADD, { anchors: [a], text: " \n " }, ON).ok).toBe(false)
})

test("ブックに無い物や、ページそのものには伝言を付けられない", () => {
  const { store, page, notes } = ready()
  for (const anchors of [["nothing"], [page]])
    expect(store.actions.perform(ADD, { anchors, text: "x" }, ON)).toEqual({ ok: false, reason: "refused" })
  expect(notes()).toEqual([])
})

test("ロック中のブックにも伝言を付け・変え・消せる（ロックはアノテーションを止めない）", () => {
  const { store, a, notes } = ready()
  expect(store.actions.perform("@matomezu/base:book-lock", {}, ON).ok).toBe(true)
  expect(store.actions.perform(ADD, { anchors: [a], text: "x" }, ON).ok).toBe(true)
  const id = notes()[0]!.id
  expect(store.actions.perform(UPDATE, { note: id, text: "y" }, ON).ok).toBe(true)
  expect(store.actions.perform(REMOVE, { note: id }, ON).ok).toBe(true)
  expect(notes()).toEqual([])
})

test("伝言は画面の履歴に入らない", async () => {
  const { store, a } = ready()
  await Promise.resolve()
  const before = store.state.getState().history.b1
  store.actions.perform(ADD, { anchors: [a], text: "x" }, ON)
  await Promise.resolve()
  expect(store.state.getState().history.b1).toBe(before)
})

test("アンカーの物を消すとアンカーから外れ、全部消えると伝言も消える。Undo で物が戻っても伝言は戻らない", async () => {
  const { store, page, a, b, notes } = ready()
  await Promise.resolve()
  store.actions.perform(ADD, { anchors: [a, b], text: "x" }, ON)
  store.actions.perform(ADD, { anchors: [a], text: "y" }, ON)
  expect(store.actions.perform("@matomezu/paper:item-remove", { page, items: [a] }, ON).ok).toBe(true)
  expect(notes().map(n => n.anchors)).toEqual([[b]])
  await Promise.resolve()
  expect(store.actions.perform("@matomezu/paper:item-remove", { page, items: [b] }, ON).ok).toBe(true)
  expect(notes()).toEqual([])
  expect(store.state.getState().annotations).toEqual({})
  await Promise.resolve()
  expect(store.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  expect((store.state.getState().books.b1 as Drawing).pages[0]!.items!.map(i => i.id)).toContain(b)
  expect(notes()).toEqual([])
})

test("AI が読んだと知らせると既読になり、伝言は残る。既読のものは既読にできない", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "読んで" }, ON)
  const id = notes()[0]!.id
  expect(store.actions.perform(READ, { note: id }, ON).ok).toBe(true)
  expect(notes().map(n => n.id)).toEqual([id])
  expect((notes()[0]!.props as { readAt?: string }).readAt).toBeString()
  expect(store.actions.perform(READ, { note: id }, ON).ok).toBe(false)
})

test("文を変えると未読に戻る。吹き出しだけを変えても既読のまま。何も変わらなければ断る", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "直して" }, ON)
  const id = notes()[0]!.id
  const props = () => notes()[0]!.props as { text: string; bubble: boolean; readAt?: string }
  store.actions.perform(READ, { note: id }, ON)
  expect(store.actions.perform(UPDATE, { note: id, bubble: true }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, text: "直して" }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, bubble: false }, ON).ok).toBe(true)
  expect(props()).toMatchObject({ bubble: false, readAt: expect.any(String) })
  expect(store.actions.perform(UPDATE, { note: id, text: "やっぱり" }, ON).ok).toBe(true)
  expect(props().text).toBe("やっぱり")
  expect(props().readAt).toBeUndefined()
})

test("マスターには伝言を付けられない（タイプが種類を外している）", () => {
  const { store } = ready()
  expect(store.actions.perform(ADD, { anchors: ["x"], text: "x" }, { book: MASTER_BOOK.id }).ok).toBe(false)
})

test("ブックを消すと、そのブックの伝言も消える", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "x" }, ON)
  expect(store.actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(true)
  expect(notes()).toHaveLength(1)
  expect(store.actions.perform("@matomezu/base:book-purge", { books: ["b1"] }).ok).toBe(true)
  expect(store.state.getState().annotations).toEqual({})
})

test("AI は伝言を付け・変え・消せない（利用者だけ）が、読んだと知らせられる", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "x" }, ON)
  const id = notes()[0]!.id
  const s = store.state.getState()
  const world = { books: s.books, settings: s.settings, annotations: s.annotations }
  const ctx = { catalog: CORE_CATALOG, home: null, lang: "en" as const, newId: () => "n", now: "t", by: "ai" as const }
  const ai = (action: string, args: unknown) => performIn(world, action, args, ON, ctx)
  const refused = { ok: false, reason: "not-allowed" } as const
  expect(ai(ADD, { anchors: [a], text: "y" })).toEqual(refused)
  expect(ai(UPDATE, { note: id, text: "y" })).toEqual(refused)
  expect(ai(REMOVE, { note: id })).toEqual(refused)
  expect(ai(READ, { note: id }).ok).toBe(true)
})

test("付ける先を変えられる（吹き出しは最後の物のそば）。付ける先だけ変えても既読のまま。ブックに無い物には変えられない", () => {
  const { store, a, b, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "見て" }, ON)
  const id = notes()[0]!.id
  store.actions.perform(READ, { note: id }, ON)
  expect(store.actions.perform(UPDATE, { note: id, anchors: [a] }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, anchors: [b, a] }, ON).ok).toBe(true)
  expect(notes()[0]).toMatchObject({ anchors: [b, a], props: { readAt: expect.any(String) } })
  expect(store.actions.perform(UPDATE, { note: id, anchors: ["nothing"] }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, text: "直した", anchors: [b] }, ON).ok).toBe(true)
  expect(notes()[0]).toMatchObject({ anchors: [b], props: { text: "直した" } })
  expect((notes()[0]!.props as { readAt?: string }).readAt).toBeUndefined()
})
