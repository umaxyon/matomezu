// マーク（base のアノテーションの種類）: 文の無い印。付けるのは利用者だけで、1 つの物に 1 つ。読まれるまで AI の応えを待ち、利用者も AI も外せる
import { expect, test } from "bun:test"
import { type Annotation, annotationsForAi } from "../../web/src/core/annotation"
import { performIn } from "../../web/src/core/perform"
import type { BookOf } from "../../web/src/core/schema/book"
import { MARK_PICKER } from "../../web/src/plugins/base/mark/commands"
import { NOTE_DRAFT } from "../../web/src/plugins/base/note/commands"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { isShown } from "../../web/src/store/commands"
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
  const marks = (): readonly Annotation[] => store.state.getState().annotations.b1 ?? []
  // 種類は知らない名前も試すので、型を緩めて渡す
  const add = (anchors: string[], kind: string) =>
    (store.actions.perform as (id: string, args: unknown, on: typeof ON) => { ok: boolean; result?: unknown })(
      "@matomezu/base:mark-add",
      { anchors, kind },
      ON,
    )
  return { store, a, b, marks, add }
}

test("マークを付けると、種類を持ち、id を返す。知らない種類は付けない", () => {
  const { a, marks, add } = ready()
  const done = add([a], "suzume")
  expect(done).toMatchObject({ ok: true, result: { mark: expect.any(String) } })
  expect(marks()).toEqual([
    {
      id: done.ok ? (done.result as { mark: string }).mark : "",
      annotation: "@matomezu/base:mark",
      anchors: [a],
      props: { kind: "suzume" },
    },
  ])
  expect(add([a], "crow").ok).toBe(false)
})

test("1 つの物にマークは 1 つ: 付けると、その物のほかのマークは外れ、付く物が無くなったマークは消える", () => {
  const { a, b, marks, add } = ready()
  add([a, b], "inko")
  add([a], "alert")
  expect(marks().map(m => [m.props, m.anchors])).toEqual([
    [{ kind: "inko" }, [b]],
    [{ kind: "alert" }, [a]],
  ])
  add([b], "fukurou")
  expect(marks().map(m => [m.props, m.anchors])).toEqual([
    [{ kind: "alert" }, [a]],
    [{ kind: "fukurou" }, [b]],
  ])
})

test("AI はマークを付けられないが、読んだ印を付けて外せる。読まれるまで AI の応えを待つ", () => {
  const { store, a, marks, add } = ready()
  add([a], "tsunagidori")
  const id = marks()[0]!.id
  const s = store.state.getState()
  const book = s.books.b1!
  expect(annotationsForAi(CORE_CATALOG, book, marks()).map(m => m.awaits)).toEqual([true])
  let world = { books: s.books, settings: s.settings, annotations: s.annotations }
  const ctx = { catalog: CORE_CATALOG, home: null, lang: "en" as const, newId: () => "n", now: "t", by: "ai" as const }
  const ai = (action: string, args: unknown) => {
    const done = performIn(world, action, args, ON, ctx)
    if (done.ok && done.annotations) world = { ...world, annotations: { ...world.annotations, ...done.annotations } }
    return done
  }
  expect(ai("@matomezu/base:mark-add", { anchors: [a], kind: "inko" })).toEqual({ ok: false, reason: "not-allowed" })
  expect(ai("@matomezu/base:mark-read", { mark: id }).ok).toBe(true)
  expect(annotationsForAi(CORE_CATALOG, book, world.annotations.b1 ?? []).map(m => m.awaits)).toEqual([false])
  expect(ai("@matomezu/base:mark-read", { mark: id }).ok).toBe(false)
  expect(ai("@matomezu/base:mark-remove", { mark: id }).ok).toBe(true)
  expect(world.annotations.b1).toEqual([])
})

test("マスターにはマークを付けられない（タイプが種類を外している）", () => {
  const { store } = ready()
  expect(
    store.actions.perform("@matomezu/base:mark-add", { anchors: ["x"], kind: "inko" }, { book: MASTER_BOOK.id }).ok,
  ).toBe(false)
})

test("右クリックのコマンドは、base のステージの画面の状態に付ける先を置く。選んでいる物の 1 つを押すと、選んでいる物の全部に付ける", () => {
  const { store, a, b } = ready()
  const base = () => store.state.getState().stageStates.s1?.["@matomezu/base"]
  expect(store.actions.command("s1", "@matomezu/base:mark-new", a)).toBe(true)
  expect(MARK_PICKER.read(base())).toEqual({ anchors: [a] })
  store.actions.select("s1", [b, a])
  store.actions.command("s1", "@matomezu/base:note-new", a)
  expect(NOTE_DRAFT.read(base())).toEqual({ anchors: [b, a] })
  expect(MARK_PICKER.read(base())).toEqual({ anchors: [a] })
  store.actions.command("s1", "@matomezu/base:note-new", "x")
  expect(NOTE_DRAFT.read(base())).toEqual({ anchors: ["x"] })
})

test("マスターでは、右クリックの「AIに伝言」「AIに示す」を出さない", () => {
  const { store } = ready()
  const shown = () =>
    ["@matomezu/base:note-new", "@matomezu/base:mark-new"].map(id =>
      isShown(store, store.state.getState(), "s1", id as never),
    )
  expect(shown()).toEqual([true, true])
  store.actions.openBook("s1", MASTER_BOOK.id)
  expect(shown()).toEqual([false, false])
})
