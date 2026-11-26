// 参照エントリと履歴: 指す先を消した書き込みは消した側のブックの履歴にだけ入り、戻すと同じ書き込みで消えた参照エントリも戻る。参照エントリを消したのも戻せる

import { expect, test } from "bun:test"
import { patchesToward } from "../../../web/src/plugins/base/history/restore"
import { newStore, worldRows } from "../../support"

const settled = () => Promise.resolve()

function setup() {
  const store = newStore({ now: () => "2026-11-19T01:00:00.000Z" })
  const { perform } = store.actions
  const state = () => store.state.getState()
  const lineup = (book: string) => state().folders[book]?.lineup.map(r => r.id)
  // ブックの画面の Ctrl+Z（plugins/base/history/index.ts と同じ）
  const bookUndo = (book: string) => {
    const step = (state().history[book] ?? { undo: [] }).undo.at(-1)
    if (!step) return { ok: false as const }
    const done = perform("@matomezu/base:history-revert", {
      outermosts: [...step.outermosts, ...step.also].map(id => ({ kind: "book" as const, id })),
      pages: patchesToward(step.pages, "before"),
      folders: patchesToward(step.folders, "before"),
    })
    if (done.ok) store.actions.moveHistory(book, "undo")
    return done
  }
  return { store, perform, lineup, bookUndo }
}

test("指す先のページを消して戻すと、参照エントリも戻る", async () => {
  const { perform, lineup, bookUndo } = setup()
  const added = perform("@matomezu/base:reference-add", { of: { kind: "page", id: "p1" } }, { book: "b2" })
  expect(added.ok).toBe(true)
  await settled()
  const ref = (added as { result: { reference: string } }).result.reference
  const before = lineup("b2")
  expect(before).toContain(ref)
  expect(perform("@matomezu/base:page-remove", { page: "p1" }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect(lineup("b2")).not.toContain(ref)
  expect(bookUndo("b1").ok).toBe(true)
  await settled()
  expect(lineup("b1")).toContain("p1")
  expect(lineup("b2")).toEqual(before)
})

test("参照エントリを消して戻すと、元の所に戻る", async () => {
  const { perform, lineup, bookUndo } = setup()
  const added = perform("@matomezu/base:reference-add", { of: { kind: "page", id: "p1" } }, { book: "b2" })
  await settled()
  const ref = (added as { result: { reference: string } }).result.reference
  const before = lineup("b2")
  expect(perform("@matomezu/base:reference-remove", { reference: ref }, { book: "b2" }).ok).toBe(true)
  await settled()
  expect(lineup("b2")).not.toContain(ref)
  expect(bookUndo("b2").ok).toBe(true)
  await settled()
  expect(lineup("b2")).toEqual(before)
})

// 参照エントリを b2 に置いて確かめた store（ステージ s1 は b1 を開いている）
async function placed() {
  const t = setup()
  const added = t.perform("@matomezu/base:reference-add", { of: { kind: "page", id: "p1" } }, { book: "b2" })
  expect(added.ok).toBe(true)
  await settled()
  const ref = (added as { result: { reference: string } }).result.reference
  return { ...t, ref, before: t.lineup("b2") }
}

test("指す先のページを消した書き込みは、消した側のブックの履歴にだけ入り、そこで戻すと参照エントリも戻り、やり直すと両方が消える", async () => {
  const { perform, lineup, store, before, ref } = await placed()
  const steps = () => store.state.getState().history.b2?.undo.length ?? 0
  const was = steps()
  expect(perform("@matomezu/base:page-remove", { page: "p1" }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect(steps()).toBe(was)
  store.actions.command("s1", "@matomezu/base:undo")
  await settled()
  expect(lineup("b1")).toContain("p1")
  expect(lineup("b2")).toEqual(before)
  store.actions.command("s1", "@matomezu/base:redo")
  await settled()
  expect(lineup("b1")).not.toContain("p1")
  expect(lineup("b2")).not.toContain(ref)
})

test("参照エントリが外れたブックがゴミ箱に入っていても、消した側で戻すとページは戻る", async () => {
  const { perform, lineup, store } = await placed()
  expect(perform("@matomezu/base:page-remove", { page: "p1" }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  await settled()
  store.actions.command("s1", "@matomezu/base:undo")
  await settled()
  expect(lineup("b1")).toContain("p1")
})

test("参照エントリを並べ替えたあと指す先を消されたブックで、並べ替えを戻しても、指す先の無い参照エントリは戻らない", async () => {
  const { perform, lineup, bookUndo, ref } = await placed()
  expect(perform("@matomezu/base:reference-move", { reference: ref, index: 0 }, { book: "b2" }).ok).toBe(true)
  await settled()
  expect(perform("@matomezu/base:page-remove", { page: "p1" }, { book: "b1" }).ok).toBe(true)
  await settled()
  bookUndo("b2")
  await settled()
  expect(lineup("b2")).not.toContain(ref)
  expect(lineup("b1")).not.toContain("p1")
})

test("AI が指す先のページを消したときも、消した側のブックの履歴にだけ入り、そこで戻すと参照エントリも戻る", async () => {
  const { lineup, store, before, ref } = await placed()
  const state = () => store.state.getState()
  store.receive({ ...worldRows(Object.values(state().books)), settings: {} }, [])
  const steps = () => state().history.b2?.undo.length ?? 0
  const was = steps()
  const books = Object.values(state().books).map(b =>
    b.id === "b1"
      ? { ...b, lineup: b.lineup.filter(e => e.id !== "p1") }
      : b.id === "b2"
        ? { ...b, lineup: b.lineup.filter(e => e.id !== ref) }
        : b,
  )
  store.receive({ ...worldRows(books as never), settings: {} }, [], {
    by: "ai",
    act: "1",
    actions: ["@matomezu/base:page-remove"],
  })
  expect(lineup("b1")).not.toContain("p1")
  expect(steps()).toBe(was)
  expect(state().history.b1?.undo.at(-1)?.by).toBe("ai")
  store.actions.command("s1", "@matomezu/base:undo")
  await settled()
  expect(lineup("b1")).toContain("p1")
  expect(lineup("b2")).toEqual(before)
})
