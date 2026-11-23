// マーク（base のアノテーションの種類）: 文の無い印。付けるのは利用者だけで、1 つの物に 1 つ。読まれるまで AI の応えを待ち、利用者も AI も外せる

import { expect, test } from "bun:test"
import { AI } from "../../../web/src/core/actor"
import { type Annotation, annotationsForAi } from "../../../web/src/core/annotation"
import { pagesOf } from "../../../web/src/core/book"
import { NO_CONTROL_CENTER } from "../../../web/src/core/def/action"
import { performIn } from "../../../web/src/core/perform-world"
import type { Book } from "../../../web/src/core/schema/book"
import { MARK_PICKER } from "../../../web/src/plugins/base/mark/states"
import { NEW_NOTE } from "../../../web/src/plugins/base/note/panel-id"
import { RIGHT_SIDE_PANEL_STATE } from "../../../web/src/plugins/base/right-side-panel/state"
import { pluginValueOf } from "../../../web/src/store/plugin-state"
import { CORE_CATALOG, newStore } from "../../support"

type Drawing = Book
const ON = { page: "p1" }

// 見本のブック b1 の最初のページに箱を 2 つ置いた store
function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const page = pagesOf(store.state.getState().books.b1 as Drawing)[0]!.id
  const place = (x: number) =>
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/box:shape-nest-box", at: { x, y: 40 }, props: { caption: "箱" } },
      { page },
    )
  const [a, b] = [place(40), place(400)].map(done => (done.ok ? (done.result as { item: string }).item : "")) as [
    string,
    string,
  ]
  const marks = (): readonly Annotation[] => store.state.getState().annotations.p1 ?? []
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
      props: { kind: "suzume", addedAt: expect.any(String) },
    },
  ])
  expect(add([a], "crow").ok).toBe(false)
})

test("1 つの物にマークは 1 つ: 付けると、その物のほかのマークは外れ、付く物が無くなったマークは消える", () => {
  const { a, b, marks, add } = ready()
  add([a, b], "inko")
  add([a], "alert")
  expect(marks()).toMatchObject([
    { props: { kind: "inko", addedAt: expect.any(String) }, anchors: [b] },
    { props: { kind: "alert", addedAt: expect.any(String) }, anchors: [a] },
  ])
  add([b], "fukurou")
  expect(marks()).toMatchObject([
    { props: { kind: "alert" }, anchors: [a] },
    { props: { kind: "fukurou" }, anchors: [b] },
  ])
  expect(marks()).toHaveLength(2)
})

test("AI はマークを付けられないが、読んだ印を付けて外せる。読まれるまで AI の応えを待つ", () => {
  const { store, a, marks, add } = ready()
  add([a], "tsunagidori")
  const id = marks()[0]!.id
  const s = store.state.getState()
  const book = s.books.b1!
  expect(annotationsForAi(CORE_CATALOG, pagesOf(book)[0]!, marks()).map(m => m.awaits)).toEqual([true])
  let world = {
    pages: s.pages,
    folders: s.folders,
    settings: s.settings,
    annotations: s.annotations,
    participants: [],
    records: {},
    counters: {},
  }
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: NO_CONTROL_CENTER,
    lang: "en" as const,
    newId: () => "n",
    now: "t",
    today: "2026-01-01",
    actor: AI,
  }
  const ai = (action: string, args: unknown) => {
    const done = performIn(world, action, args, ON, ctx)
    if (done.ok && done.annotations) world = { ...world, annotations: { ...world.annotations, ...done.annotations } }
    return done
  }
  expect(ai("@matomezu/base:mark-add", { anchors: [a], kind: "inko" })).toEqual({ ok: false, reason: "not-allowed" })
  expect(ai("@matomezu/base:mark-read", { mark: id }).ok).toBe(true)
  expect(annotationsForAi(CORE_CATALOG, pagesOf(book)[0]!, world.annotations.p1 ?? []).map(m => m.awaits)).toEqual([
    false,
  ])
  expect(ai("@matomezu/base:mark-read", { mark: id }).ok).toBe(false)
  expect(ai("@matomezu/base:mark-remove", { mark: id }).ok).toBe(true)
  expect(world.annotations.p1).toEqual([])
})

test("右クリックのコマンドは、base のステージのプラグイン状態に付ける先を置く（伝言は、右サイドパネルの付いた先。選択を合わせるのは右サイドパネルの入れ物）。選んでいる物の 1 つを押すと、選んでいる物の全部に付ける", () => {
  const { store, a, b } = ready()
  const picker = () => pluginValueOf(store.state.getState().pluginValues, "s1", MARK_PICKER)
  expect(store.actions.command("s1", "@matomezu/base:mark-new", a)).toBe(true)
  expect(picker()).toEqual({ anchors: [a] })
  store.actions.select("s1", [b, a])
  store.actions.command("s1", "@matomezu/base:note-new", a)
  expect(pluginValueOf(store.state.getState().pluginValues, "s1", RIGHT_SIDE_PANEL_STATE)).toMatchObject({
    subject: NEW_NOTE,
    anchors: [b, a],
    current: a,
  })
  expect(picker()).toEqual({ anchors: [a] })
  store.actions.command("s1", "@matomezu/base:note-new", b)
  expect(pluginValueOf(store.state.getState().pluginValues, "s1", RIGHT_SIDE_PANEL_STATE)).toMatchObject({
    anchors: [a, b],
    current: b,
  })
  store.actions.select("s1", [b])
  store.actions.command("s1", "@matomezu/base:note-new", a)
  expect(pluginValueOf(store.state.getState().pluginValues, "s1", RIGHT_SIDE_PANEL_STATE)).toMatchObject({
    anchors: [a],
    current: a,
  })
})
