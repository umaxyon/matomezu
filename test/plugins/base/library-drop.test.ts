// 書庫の画面のドラッグで落とす先（base/library/drop.ts）: 落とせるか・行の間の位置・名前が重なるときに確かめる事が、動かすアクションと合う
import { expect, test } from "bun:test"
import { entriesIn } from "../../../web/src/core/entries"
import { HOME_ID } from "../../../web/src/core/folders"
import { type Drop, draggable, droppable, indexBefore, moveClashOf } from "../../../web/src/plugins/base/library/drop"
import { newStore } from "../../support"

function setup() {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const folder = (title: string, into?: string) =>
    (perform("@matomezu/base:folder-create", { title, into }).result as { folder: string }).folder
  const library = () => store.state.getState()
  const ids = (into: string) => entriesIn(library().folders, into).map(r => r.id)
  return { perform, folder, library, ids }
}

test("掴めるのは書庫ホームかフォルダの直下の物。自分の中・ブックの中・同じ場所へは落とせず、ゴミ箱へは落とせる", () => {
  const { folder, library, ids } = setup()
  const a = folder("あ")
  const inner = folder("中", a)
  expect(draggable(library().folders, "b1")).toBe(true)
  expect(draggable(library().folders, inner)).toBe(true)
  expect(draggable(library().folders, "p1")).toBe(false) // ブックの中のページ
  expect(draggable(library().folders, HOME_ID)).toBe(false)
  const can = (entry: string, drop: Drop) => droppable(library(), entry, drop)
  expect(can("b1", { to: "folder", into: a })).toBe(true)
  expect(can("b1", { to: "trash" })).toBe(true)
  expect(can(a, { to: "folder", into: inner })).toBe(false)
  expect(can(a, { to: "folder", into: a })).toBe(false)
  expect(can(a, { to: "folder", into: "b1" })).toBe(false)
  expect(can("p1", { to: "folder", into: a })).toBe(false)
  // 同じ場所: 今の位置と、その次の行の前
  const home = ids(HOME_ID)
  expect(home[0]).toBe("b1")
  expect(
    can("b1", { to: "folder", into: HOME_ID, index: indexBefore(library().folders, HOME_ID, "b1", home[1]) }),
  ).toBe(false)
  expect(
    can("b1", { to: "folder", into: HOME_ID, index: indexBefore(library().folders, HOME_ID, "b1", home[2]) }),
  ).toBe(true)
})

test("行の間へ落とす位置は、掴んだ物を除いて数え、その index で entry-move を行うと、名指した行の前に入る（同じフォルダの上へ・下へ、別のフォルダへ）", () => {
  const { perform, folder, library, ids } = setup()
  const a = folder("あ")
  const home = ids(HOME_ID)
  const [first, second, third, fourth] = home as [string, string, string, string]
  const move = (entry: string, into: string, before: string | undefined) => {
    const index = indexBefore(library().folders, into, entry, before)
    expect(perform("@matomezu/base:entry-move", { entry, into, index }).ok).toBe(true)
  }
  // 下へ: first を fourth の前へ
  move(first, HOME_ID, fourth)
  expect(ids(HOME_ID).slice(0, 4)).toEqual([second, third, first, fourth])
  // 上へ: fourth を second の前へ
  move(fourth, HOME_ID, second)
  expect(ids(HOME_ID).slice(0, 4)).toEqual([fourth, second, third, first])
  // 末尾へ
  move(fourth, HOME_ID, undefined)
  expect(ids(HOME_ID).at(-1)).toBe(fourth)
  // 別のフォルダへ: 末尾、そのあと先頭の前
  move(first, a, undefined)
  move(second, a, first)
  expect(ids(a)).toEqual([second, first])
})

test("別のフォルダに同じ名前の物が在れば、番号を付けた名前と、上書きで消える物と、上書きの位置（消える物を除いて数える）を出す。その位置で entry-move-over を行うと、名指した行の前に入る", () => {
  const { perform, folder, library, ids } = setup()
  const a = folder("あ")
  const x = folder("同じ", a)
  const y = folder("後ろ", a)
  const mine = folder("同じ")
  expect(ids(a)).toEqual([x, y])
  // 重ならない物・同じフォルダの中の並べ替えは、確かめない
  expect(moveClashOf(library(), "b1", { to: "folder", into: a })).toBeUndefined()
  expect(moveClashOf(library(), x, { to: "folder", into: a, index: 1 })).toBeUndefined()
  expect(moveClashOf(library(), mine, { to: "trash" })).toBeUndefined()
  // y の前（消える x の後ろ）へ: 上書きの位置は 1 つ前へずれる
  const index = indexBefore(library().folders, a, mine, y)
  expect(index).toBe(1)
  const clash = moveClashOf(library(), mine, { to: "folder", into: a, index })
  expect(clash).toEqual({ numbered: "同じ 2", replaces: x, overwrite: "ok", indexOver: 0 })
  // x の前へ・末尾へ
  expect(moveClashOf(library(), mine, { to: "folder", into: a, index: 0 })?.indexOver).toBe(0)
  expect(moveClashOf(library(), mine, { to: "folder", into: a })?.indexOver).toBeUndefined()
  expect(
    perform("@matomezu/base:entry-move-over", { entry: mine, into: a, index: clash?.indexOver, replaces: x }).ok,
  ).toBe(true)
  expect(ids(a)).toEqual([mine, y])
})

test("上書きできない訳を出す（種類が違う）", () => {
  const { perform, folder, library } = setup()
  const a = folder("あ")
  const book = (perform("@matomezu/base:book-create", { title: "同じ", into: a }).result as { book: string }).book
  expect(book).toBeDefined()
  const mine = folder("同じ")
  expect(moveClashOf(library(), mine, { to: "folder", into: a })).toMatchObject({ replaces: book, overwrite: "kind" })
})
