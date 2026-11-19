// 書庫の画面の履歴とブックの画面の履歴が、同じブックの並びを変えたとき: 書庫でブックの中を変えてからタブで変え、書庫の画面で戻す（と、その逆の順）。
// 後の変更を保ったまま戻るか、ぶつかるなら断る（段を捨てる）。後の変更を黙って上書きせず、ページを落とさない

import { expect, test } from "bun:test"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { patchesToward } from "../../web/src/plugins/base/history/restore"
import { libraryRevertArgs } from "../../web/src/plugins/base/library/revert"
import { newStore } from "../support"

const settled = () => Promise.resolve()
const DRAWING = "@matomezu/drawing:drawing"

function setup() {
  const store = newStore({ now: () => "2026-11-19T01:00:00.000Z" })
  const { perform } = store.actions
  const state = () => store.state.getState()
  const lineup = (book: string) => state().folders[book]?.lineup.map(r => r.id)
  const pageIds = () => Object.keys(state().pages)
  const steps = (h: string) => state().history[h] ?? { undo: [], redo: [] }
  // 書庫の画面の Ctrl+Z（plugins/base/library/commands.ts と同じ: 断られたら、ぶつかった段は捨てる）
  const libraryUndo = () => {
    const step = steps(LIBRARY_HISTORY).undo.at(-1)
    if (!step) return { ok: false as const }
    const done = perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before"))
    if (done.ok) store.actions.moveHistory(LIBRARY_HISTORY, "undo")
    return done
  }
  // ブックの画面の Ctrl+Z（plugins/base/history/index.ts と同じ）
  const bookUndo = (book: string) => {
    const step = steps(book).undo.at(-1)
    if (!step) return { ok: false as const }
    const done = perform("@matomezu/base:book-revert", {
      books: [...step.books],
      pages: patchesToward(step.pages, "before"),
      folders: patchesToward(step.folders, "before"),
    })
    if (done.ok) store.actions.moveHistory(book, "undo")
    return done
  }
  const add = async (book: string, title: string) => {
    const done = perform("@matomezu/base:page-add", { type: DRAWING, title }, { book })
    if (!done.ok) throw new Error(JSON.stringify(done))
    await settled()
    return (done.result as { page: string }).page
  }
  const lib = async (action: string, args: Record<string, unknown>) => {
    const done = (perform as (id: string, args: unknown) => ReturnType<typeof perform>)(
      `@matomezu/base:${action}`,
      args,
    )
    await settled()
    return done
  }
  // b1 のページ p1 を、b2 のページと名前が重ならないようにしておく（同じブックの中に同じ名前は置けない）
  const renamed = async () => {
    expect(perform("@matomezu/base:page-update", { title: "まとめ" }, { page: "p1" }).ok).toBe(true)
    await settled()
  }
  return { store, perform, state, lineup, pageIds, steps, libraryUndo, bookUndo, add, lib, renamed }
}

test("書庫でブックの中を並べ替え → タブでページを足す → 書庫で戻す: 並びは戻り、足したページは残る", async () => {
  const { lineup, libraryUndo, add, lib } = setup()
  const a = await add("b1", "A")
  const b = await add("b1", "B")
  expect((await lib("entry-move", { entry: "p1", into: "b1" })).ok).toBe(true)
  expect(lineup("b1")).toEqual([a, b, "p1"])
  const c = await add("b1", "C")
  expect(libraryUndo().ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1", a, b, c])
})

test("書庫でページをほかのブックへ動かす → 先のブックのタブでページを足す → 書庫で戻す: ページは元のブックへ戻り、足したページは残る", async () => {
  const { lineup, pageIds, libraryUndo, add, lib, renamed } = setup()
  await renamed()
  expect((await lib("entry-move", { entry: "p1", into: "b2" })).ok).toBe(true)
  expect(lineup("b1")).toEqual([])
  expect(lineup("b2")).toEqual(["b2-p1", "p1"])
  const c = await add("b2", "C")
  expect(libraryUndo().ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1"])
  expect(lineup("b2")).toEqual(["b2-p1", c])
  expect(pageIds()).toContain(c)
})

test("書庫でページをほかのブックへ動かす → 先のタブでそのページを並べ替える → 書庫で戻す: 元のブックへ戻る（並べ替えは、動かしたページの物なので残らない）", async () => {
  const { lineup, perform, libraryUndo, lib, renamed } = setup()
  await renamed()
  expect((await lib("entry-move", { entry: "p1", into: "b2" })).ok).toBe(true)
  expect(perform("@matomezu/base:page-move", { page: "p1", index: 0 }, { book: "b2" }).ok).toBe(true)
  await settled()
  expect(lineup("b2")).toEqual(["p1", "b2-p1"])
  expect(libraryUndo().ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1"])
  expect(lineup("b2")).toEqual(["b2-p1"])
})

test("タブでページを足す → 書庫でそのページをほかのブックへ動かす → 足したブックで戻す: 断る（ほかのブックを変えるため）。ページは消えない", async () => {
  const { lineup, pageIds, bookUndo, steps, add, lib } = setup()
  const a = await add("b1", "A")
  expect((await lib("entry-move", { entry: a, into: "b2" })).ok).toBe(true)
  const before = steps("b1").undo.length
  const done = bookUndo("b1")
  // refused（ぶつかった）: 画面のコマンドは、トーストを出して段を捨てる（denied なら段を残す）
  expect(done).toMatchObject({ ok: false, reason: "refused" })
  expect(lineup("b2")).toEqual(["b2-p1", a])
  expect(pageIds()).toContain(a)
  expect(steps("b1").undo).toHaveLength(before)
})

test("タブで並べ替える → 書庫で同じブックの中を並べ替える → タブで戻す: 書庫の並べ替えを上書きしない所は残る", async () => {
  const { lineup, perform, bookUndo, add, lib } = setup()
  const a = await add("b1", "A")
  const b = await add("b1", "B")
  expect(perform("@matomezu/base:page-move", { page: b, index: 0 }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect(lineup("b1")).toEqual([b, "p1", a])
  expect((await lib("entry-move", { entry: a, into: "b1", index: 0 })).ok).toBe(true)
  expect(lineup("b1")).toEqual([a, b, "p1"])
  const done = bookUndo("b1")
  // タブの並べ替え（b を先頭へ）を戻す: b と p1 の順だけを戻し、a の位置（書庫で動かした）は残る
  expect(done.ok).toBe(true)
  expect(lineup("b1")).toEqual([a, "p1", b])
})

test("タブでページを足す → 書庫でほかのページをそのブックへ動かす → タブで戻す: 足したページだけが消え、動かしたページは残る", async () => {
  const { lineup, pageIds, bookUndo, add, lib, renamed } = setup()
  await renamed()
  const a = await add("b2", "A")
  expect((await lib("entry-move", { entry: "p1", into: "b2" })).ok).toBe(true)
  expect(bookUndo("b2").ok).toBe(true)
  expect(lineup("b2")).toEqual(["b2-p1", "p1"])
  expect(pageIds()).not.toContain(a)
  expect(pageIds()).toContain("p1")
})

test("書庫で同じブックの中を並べ替える → タブで並べ替える → 書庫で戻す", async () => {
  const { lineup, perform, libraryUndo, add, lib } = setup()
  const a = await add("b1", "A")
  const b = await add("b1", "B")
  expect((await lib("entry-move", { entry: "p1", into: "b1" })).ok).toBe(true)
  expect(lineup("b1")).toEqual([a, b, "p1"])
  expect(perform("@matomezu/base:page-move", { page: b, index: 0 }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect(lineup("b1")).toEqual([b, a, "p1"])
  const done = libraryUndo()
  expect(done.ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1", b, a])
})

test("書庫でブックの名前を変える → タブでブックの名前を変える → 書庫で戻す: 同じ所がぶつかった置き直しは、後から付けた名前を元の名前で上書きする", async () => {
  const { state, perform, libraryUndo, lib } = setup()
  expect((await lib("entry-rename", { entry: "b1", title: "書庫で" })).ok).toBe(true)
  expect(perform("@matomezu/base:book-update", { title: "タブで" }, { book: "b1" }).ok).toBe(true)
  await settled()
  const done = libraryUndo()
  expect(done.ok).toBe(true)
  expect(state().books.b1?.title).toBe("まとめ図の構想")
})

test("タブでブックの名前を変える → 書庫でブックの名前を変える → タブで戻す: 同じ所がぶつかった置き直しは、後から付けた名前を元の名前で上書きする", async () => {
  const { state, perform, bookUndo, lib } = setup()
  expect(perform("@matomezu/base:book-update", { title: "タブで" }, { book: "b1" }).ok).toBe(true)
  await settled()
  expect((await lib("entry-rename", { entry: "b1", title: "書庫で" })).ok).toBe(true)
  const done = bookUndo("b1")
  expect(done.ok).toBe(true)
  expect(state().books.b1?.title).toBe("まとめ図の構想")
})

test("書庫で写す・作る → タブでページを足す → 書庫で戻す: 写した・作ったページだけが消え、足したページは残る", async () => {
  const { lineup, libraryUndo, add, lib } = setup()
  const copied = await lib("entry-duplicate", { entry: "p1" })
  const copy = (copied.ok && (copied.result as { entry: string }).entry) as string
  const made = await lib("page-create", { folder: "b2", type: DRAWING, title: "新" })
  const fresh = (made.ok && (made.result as { page: string }).page) as string
  const a = await add("b1", "A")
  const b = await add("b2", "B")
  expect(libraryUndo().ok).toBe(true)
  expect(lineup("b2")).toEqual(["b2-p1", b])
  expect(libraryUndo().ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1", a])
  expect([copy, fresh]).not.toContain(a)
})

test("タブでページを足す → 書庫で写す・作る → タブで戻す: 足したページだけが消え、写した・作ったページは残る", async () => {
  const { lineup, bookUndo, add, lib } = setup()
  const a = await add("b1", "A")
  const copied = await lib("entry-duplicate", { entry: "p1" })
  const copy = (copied.ok && (copied.result as { entry: string }).entry) as string
  const b = await add("b2", "B")
  const made = await lib("page-create", { folder: "b2", type: DRAWING, title: "新" })
  const fresh = (made.ok && (made.result as { page: string }).page) as string
  expect(bookUndo("b1").ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1", copy])
  expect(bookUndo("b2").ok).toBe(true)
  expect(lineup("b2")).toEqual(["b2-p1", fresh])
  expect(lineup("b1")).not.toContain(a)
  expect(lineup("b2")).not.toContain(b)
})
