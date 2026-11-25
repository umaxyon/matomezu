// 参照エントリと履歴: 指す先を消した書き込みを戻すと、同じ書き込みで消えた参照エントリも戻る。参照エントリを消したのも戻せる

import { expect, test } from "bun:test"
import { patchesToward } from "../../../web/src/plugins/base/history/restore"
import { newStore } from "../../support"

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
      outermosts: step.outermosts.map(id => ({ kind: "book" as const, id })),
      pages: patchesToward(step.pages, "before"),
      folders: patchesToward(step.folders, "before"),
    })
    if (done.ok) store.actions.moveHistory(book, "undo")
    return done
  }
  return { perform, lineup, bookUndo }
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

test("指す先のページを消した書き込みは、参照エントリが消えたブックの履歴にも入り、そちらで戻しても両方が戻る", async () => {
  const { perform, lineup, bookUndo } = setup()
  perform("@matomezu/base:reference-add", { of: { kind: "page", id: "p1" } }, { book: "b2" })
  await settled()
  const before = lineup("b2")
  expect(perform("@matomezu/base:page-remove", { page: "p1" }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect(bookUndo("b2").ok).toBe(true)
  await settled()
  expect(lineup("b1")).toContain("p1")
  expect(lineup("b2")).toEqual(before)
})
