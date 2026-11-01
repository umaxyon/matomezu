// コメント（base のアノテーションの種類）: ブックのデータとは別に持ち、利用者も AI も付け・返し・消せる。
// ロック中のブックにも付けられ、画面の履歴に入らず、アンカーの物が全部無くなると消える
import { expect, test } from "bun:test"
import type { Annotation } from "../../web/src/core/annotation"
import type { BookOf } from "../../web/src/core/schema/book"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { newStore } from "../support"

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
  const comments = (): readonly Annotation[] => store.state.getState().annotations.b1 ?? []
  return { store, page, a, b, comments }
}

test("コメントを付けると、ブックとは別に持ち、id を返す。文が空でも付けられ（マーク）、吹き出しは既定で出す", () => {
  const { store, a, b, comments } = ready()
  const before = store.state.getState().books.b1
  const done = store.actions.perform("@matomezu/base:comment-add", { anchors: [a, b], text: "", ask: "point" }, ON)
  expect(done).toMatchObject({ ok: true, result: { comment: expect.any(String) } })
  expect(store.state.getState().books.b1).toBe(before)
  expect(comments()).toEqual([
    {
      id: done.ok ? (done.result as { comment: string }).comment : "",
      annotation: "@matomezu/base:comment",
      anchors: [a, b],
      props: { ask: "point", bubble: true, posts: [{ by: "user", text: "", at: expect.any(String) }] },
    },
  ])
})

test("ブックに無い物や、ページそのものにはコメントを付けられない", () => {
  const { store, page, comments } = ready()
  for (const anchors of [["nothing"], [page]])
    expect(store.actions.perform("@matomezu/base:comment-add", { anchors, text: "x", ask: "reply" }, ON)).toEqual({
      ok: false,
      reason: "refused",
    })
  expect(comments()).toEqual([])
})

test("ロック中のブックにもコメントを付け・返し・消せる（ロックはアノテーションを止めない）", () => {
  const { store, a, comments } = ready()
  expect(store.actions.perform("@matomezu/base:book-lock", {}, ON).ok).toBe(true)
  expect(store.actions.perform("@matomezu/base:comment-add", { anchors: [a], text: "x", ask: "reply" }, ON).ok).toBe(
    true,
  )
  const id = comments()[0]!.id
  expect(store.actions.perform("@matomezu/base:comment-reply", { comment: id, text: "y" }, ON).ok).toBe(true)
  expect(store.actions.perform("@matomezu/base:comment-remove", { comment: id }, ON).ok).toBe(true)
  expect(comments()).toEqual([])
})

test("コメントは画面の履歴に入らない", async () => {
  const { store, a } = ready()
  await Promise.resolve()
  const before = store.state.getState().history.b1
  store.actions.perform("@matomezu/base:comment-add", { anchors: [a], text: "x", ask: "reply" }, ON)
  await Promise.resolve()
  expect(store.state.getState().history.b1).toBe(before)
})

test("アンカーの物を消すとアンカーから外れ、全部消えるとコメントも消える。Undo で物が戻ってもコメントは戻らない", async () => {
  const { store, page, a, b, comments } = ready()
  await Promise.resolve()
  store.actions.perform("@matomezu/base:comment-add", { anchors: [a, b], text: "x", ask: "reply" }, ON)
  store.actions.perform("@matomezu/base:comment-add", { anchors: [a], text: "y", ask: "reply" }, ON)
  expect(store.actions.perform("@matomezu/paper:item-remove", { page, items: [a] }, ON).ok).toBe(true)
  expect(comments().map(c => c.anchors)).toEqual([[b]])
  await Promise.resolve()
  expect(store.actions.perform("@matomezu/paper:item-remove", { page, items: [b] }, ON).ok).toBe(true)
  expect(comments()).toEqual([])
  expect(store.state.getState().annotations).toEqual({})
  await Promise.resolve()
  expect(store.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  expect((store.state.getState().books.b1 as Drawing).pages[0]!.items!.map(i => i.id)).toContain(b)
  expect(comments()).toEqual([])
})

test("AI が返すと既読になり、利用者が返すと未読に戻る。既読のものを既読にはできない", () => {
  const { store, a, comments } = ready()
  store.actions.perform("@matomezu/base:comment-add", { anchors: [a], text: "直して", ask: "reply" }, ON)
  const id = comments()[0]!.id
  const props = () => comments()[0]!.props as { readAt?: string; posts: { by: string }[] }
  expect(props().readAt).toBeUndefined()
  expect(store.actions.perform("@matomezu/base:comment-read", { comment: id }, ON).ok).toBe(true)
  expect(props().readAt).toBeString()
  expect(store.actions.perform("@matomezu/base:comment-read", { comment: id }, ON).ok).toBe(false)
  expect(store.actions.perform("@matomezu/base:comment-reply", { comment: id, text: "まだ" }, ON).ok).toBe(true)
  expect(props().readAt).toBeUndefined()
  expect(props().posts.map(p => p.by)).toEqual(["user", "user"])
})

test("吹き出しを出すかを変えられる。同じ値には変えない", () => {
  const { store, a, comments } = ready()
  store.actions.perform("@matomezu/base:comment-add", { anchors: [a], text: "x", ask: "reply" }, ON)
  const id = comments()[0]!.id
  expect(store.actions.perform("@matomezu/base:comment-update", { comment: id, bubble: true }, ON).ok).toBe(false)
  expect(store.actions.perform("@matomezu/base:comment-update", { comment: id, bubble: false }, ON).ok).toBe(true)
  expect((comments()[0]!.props as { bubble: boolean }).bubble).toBe(false)
})

test("マスターにはコメントを付けられない（タイプが種類を外している）", () => {
  const { store } = ready()
  expect(
    store.actions.perform(
      "@matomezu/base:comment-add",
      { anchors: ["x"], text: "x", ask: "reply" },
      { book: MASTER_BOOK.id },
    ).ok,
  ).toBe(false)
})

test("ブックを消すと、そのブックのコメントも消える", () => {
  const { store, a, comments } = ready()
  store.actions.perform("@matomezu/base:comment-add", { anchors: [a], text: "x", ask: "reply" }, ON)
  expect(store.actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(true)
  expect(comments()).toHaveLength(1)
  expect(store.actions.perform("@matomezu/base:book-purge", { books: ["b1"] }).ok).toBe(true)
  expect(store.state.getState().annotations).toEqual({})
})
