// 書庫のエントリのアクション: folder-create はフォルダを作り、entry-move は動かし（同じ名前は断るか、番号を付ける）、entry-rename は名前を変え、
// book-create の into は置くフォルダを決める。フォルダは、中身ごとゴミ箱に出入りし、消える。ロックした物は動かせるが、名前は変えられず、フォルダごとでもゴミ箱に入らない

import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../web/src/core/folders"
import { newStore } from "../support"

const NOW = "2026-11-18T01:00:00.000Z"
const taken = { ok: false, reason: "refused", kind: "title-taken" }

function setup() {
  const store = newStore({ now: () => NOW })
  const { perform } = store.actions
  const lineup = (id: string) => store.state.getState().folders[id]?.lineup.map(r => r.id)
  const title = (id: string) => (store.state.getState().folders[id] as { title?: string } | undefined)?.title
  const folder = (name: string, into?: string) => {
    const done = perform("@matomezu/base:folder-create", { title: name, ...(into ? { into } : {}) })
    if (!done.ok) throw new Error(`folder-create ${name}: ${JSON.stringify(done)}`)
    return (done.result as { folder: string }).folder
  }
  const book = (name: string, into?: string) => {
    const done = perform("@matomezu/base:book-create", { title: name, ...(into ? { into } : {}) })
    if (!done.ok) throw new Error(`book-create ${name}: ${JSON.stringify(done)}`)
    return (done.result as { book: string }).book
  }
  return { store, perform, lineup, title, folder, book }
}

test("folder-create は書庫ホームか言ったフォルダの末尾にフォルダを作る。同じ名前・ブックの中・無いフォルダは断る", () => {
  const { perform, lineup, folder } = setup()
  const a = folder("仕事")
  expect(lineup(HOME_ID)?.at(-1)).toBe(a)
  const b = folder("2026", a)
  expect(lineup(a)).toEqual([b])
  expect(perform("@matomezu/base:folder-create", { title: "仕事" })).toMatchObject(taken)
  expect(folder("仕事", a)).toBeString()
  expect(perform("@matomezu/base:folder-create", { title: "x", into: "b1" }).ok).toBe(false)
  expect(perform("@matomezu/base:folder-create", { title: "x", into: "nowhere" }).ok).toBe(false)
  expect(perform("@matomezu/base:folder-create", { title: "x", into: TRASH_ID }).ok).toBe(false)
})

test("book-create の into は、そのフォルダの末尾にブックを置く（書庫ホームには並ばない）", () => {
  const { lineup, folder, book } = setup()
  const a = folder("仕事")
  const made = book("議事録", a)
  expect(lineup(a)).toEqual([made])
  expect(lineup(HOME_ID)).not.toContain(made)
})

test("entry-move はブックとフォルダを別のフォルダへ動かし、同じフォルダの中で並べ替える。自分の中・ブックの中・ゴミ箱へは動かせない", () => {
  const { store, perform, lineup, folder } = setup()
  const a = folder("仕事")
  const b = folder("私用")
  expect(perform("@matomezu/base:entry-move", { entry: "b1", into: a }).ok).toBe(true)
  expect(lineup(a)).toEqual(["b1"])
  expect(lineup(HOME_ID)).not.toContain("b1")
  expect(perform("@matomezu/base:entry-move", { entry: b, into: a, index: 0 }).ok).toBe(true)
  expect(lineup(a)).toEqual([b, "b1"])
  expect(perform("@matomezu/base:entry-move", { entry: "b1", into: a, index: 0 }).ok).toBe(true)
  expect(lineup(a)).toEqual(["b1", b])
  expect(perform("@matomezu/base:entry-move", { entry: a, into: b }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-move", { entry: b, into: "b1" }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-move", { entry: b, into: TRASH_ID }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-move", { entry: HOME_ID, into: a }).ok).toBe(false)
  // ブックの中のページは、エントリのアクションでは動かせず、ゴミ箱にも入らない（ブックを開いて行う）
  const page = store.state.getState().folders.b1?.lineup[0]?.id as string
  expect(perform("@matomezu/base:entry-move", { entry: page, into: b }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-trash", { entry: page }).ok).toBe(false)
})

test("entry-move は、先に同じ名前が在れば断る。onConflict が number なら、番号を付けた名前で入れ、その名前を返す", () => {
  const { perform, title, folder, book } = setup()
  const a = folder("仕事")
  const inside = book("議事録", a)
  const outside = book("議事録")
  expect(perform("@matomezu/base:entry-move", { entry: outside, into: a })).toMatchObject(taken)
  expect(perform("@matomezu/base:entry-move", { entry: outside, into: a, onConflict: "number" })).toEqual({
    ok: true,
    result: { title: "議事録 2" },
  })
  expect(title(outside)).toBe("議事録 2")
  expect(title(inside)).toBe("議事録")
})

test("entry-rename はブックとフォルダの名前を変える。同じフォルダに同じ名前が在れば断る", () => {
  const { perform, title, folder, book } = setup()
  const a = folder("仕事")
  const made = book("議事録")
  expect(perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" }).ok).toBe(true)
  expect(title(a)).toBe("しごと")
  expect(perform("@matomezu/base:entry-rename", { entry: made, title: "記録" }).ok).toBe(true)
  expect(title(made)).toBe("記録")
  expect(perform("@matomezu/base:entry-rename", { entry: made, title: "しごと" })).toMatchObject(taken)
  expect(perform("@matomezu/base:entry-rename", { entry: HOME_ID, title: "x" }).ok).toBe(false)
})

test("ロックしたブックは動かせる。名前は変えられず、入れているフォルダごとでもゴミ箱に入らない", () => {
  const { perform, lineup, folder } = setup()
  const a = folder("仕事")
  perform("@matomezu/base:book-lock", {}, { book: "b1" })
  expect(perform("@matomezu/base:entry-move", { entry: "b1", into: a }).ok).toBe(true)
  expect(lineup(a)).toEqual(["b1"])
  const denied = { ok: false, reason: "denied", permission: "@matomezu/base:lock", book: "b1" } as const
  expect(perform("@matomezu/base:entry-rename", { entry: "b1", title: "x" })).toEqual(denied)
  expect(perform("@matomezu/base:entry-trash", { entry: a })).toEqual(denied)
  const b = folder("私用")
  expect(perform("@matomezu/base:entry-move", { entry: a, into: b }).ok).toBe(true)
})

test("フォルダは中身ごとゴミ箱に入り、戻り、消える。戻す先に同じ名前が在れば断り、number なら番号を付ける", () => {
  const { store, perform, lineup, title, folder, book } = setup()
  const a = folder("仕事")
  const sub = folder("2026", a)
  const made = book("議事録", sub)
  expect(perform("@matomezu/base:entry-trash", { entry: a }).ok).toBe(true)
  expect(store.state.getState().folders[TRASH_ID]?.lineup).toEqual([
    { kind: "folder", id: a, trashed: NOW, from: [HOME_ID] },
  ])
  expect(made in store.state.getState().books).toBe(false)
  expect(store.state.getState().trash[made]?.title).toBe("議事録")
  expect(perform("@matomezu/base:entry-trash", { entry: sub }).ok).toBe(false)
  const again = folder("仕事")
  expect(perform("@matomezu/base:entry-restore", { entry: a })).toMatchObject(taken)
  expect(perform("@matomezu/base:entry-restore", { entry: a, onConflict: "number" })).toEqual({
    ok: true,
    result: { into: HOME_ID },
  })
  expect(title(a)).toBe("仕事 2")
  expect(lineup(HOME_ID)?.slice(-2)).toEqual([again, a])
  expect(made in store.state.getState().books).toBe(true)
  perform("@matomezu/base:entry-trash", { entry: a })
  expect(perform("@matomezu/base:entry-purge", { entries: [a] }).ok).toBe(true)
  const { folders, pages, trash } = store.state.getState()
  expect([a, sub, made].some(id => id in folders)).toBe(false)
  expect(made in trash).toBe(false)
  expect(folders[TRASH_ID]?.lineup).toEqual([])
  expect(Object.keys(pages).length).toBeGreaterThan(0)
})

test("元いたフォルダが無くなっていれば、その上のフォルダへ戻す", () => {
  const { perform, lineup, folder, book } = setup()
  const a = folder("仕事")
  const sub = folder("2026", a)
  const made = book("議事録", sub)
  perform("@matomezu/base:entry-trash", { entry: made })
  perform("@matomezu/base:entry-trash", { entry: sub })
  expect(perform("@matomezu/base:entry-restore", { entry: made })).toEqual({ ok: true, result: { into: a } })
  expect(lineup(a)).toEqual([made])
})
