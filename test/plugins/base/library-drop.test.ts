// 書庫の画面のドラッグで落とす先（base/library/drop.ts）: 落とせるか・行の間の位置・名前が重なるときに確かめる事が、動かすアクションと合う
import { expect, test } from "bun:test"
import { entriesIn, isMoveRefusal, movedWithBinders } from "../../../web/src/core/entries"
import { HOME_ID, type HomeFolder, type Library, type PlainFolder } from "../../../web/src/core/folders"
import { type Drop, draggable, droppable, indexBefore, moveClashOf } from "../../../web/src/plugins/base/library/drop"
import { movesInto } from "../../../web/src/plugins/base/library/entries"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"
import { CORE_CATALOG, libraryWith, NAMING, newStore } from "../../support"

function setup() {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const folder = (title: string, into?: string) =>
    (perform("@matomezu/base:folder-create", { title, into }).result as { folder: string }).folder
  const library = () => store.state.getState()
  const ids = (into: string) => entriesIn(library().folders, into).map(r => r.id)
  return { perform, folder, library, ids }
}

test("掴めるのはゴミ箱の外の物（ブックの中のページも）。自分の中・同じ場所・ブックのフォルダの中へは落とせない。ブックの中の物はゴミ箱へは落とせない", () => {
  const { folder, library, ids } = setup()
  const a = folder("あ")
  const inner = folder("中", a)
  expect(draggable(library().folders, "b1")).toBe(true)
  expect(draggable(library().folders, inner)).toBe(true)
  expect(draggable(library().folders, "p1")).toBe(true) // ブックの中のページ
  expect(draggable(library().folders, HOME_ID)).toBe(false)
  const can = (entry: string, drop: Drop) => droppable(CORE_CATALOG, library(), entry, drop)
  expect(can("b1", { to: "folder", into: a })).toBe(true)
  expect(can("b1", { to: "trash" })).toBe(true)
  expect(can(a, { to: "folder", into: inner })).toBe(false)
  expect(can(a, { to: "folder", into: a })).toBe(false)
  expect(can(a, { to: "folder", into: "b1" })).toBe(false)
  expect(can("p1", { to: "folder", into: a })).toBe(true)
  expect(can("p1", { to: "trash" })).toBe(false)
  expect(can("p1", { to: "folder", into: "b2" })).toBe(true)
  expect(can("p1", { to: "folder", into: "b1" })).toBe(false) // 同じ場所
  // 同じ場所: 今の位置と、その次の行の前
  const home = ids(HOME_ID)
  expect(home[0]).toBe("b1")
  expect(
    can("b1", { to: "folder", into: HOME_ID, index: indexBefore(CORE_CATALOG, library(), HOME_ID, "b1", home[1]) }),
  ).toBe(false)
  expect(
    can("b1", { to: "folder", into: HOME_ID, index: indexBefore(CORE_CATALOG, library(), HOME_ID, "b1", home[2]) }),
  ).toBe(true)
})

test("行の間へ落とす位置は、掴んだ物を除いて数え、その index で entry-move を行うと、名指した行の前に入る（同じフォルダの上へ・下へ、別のフォルダへ）", () => {
  const { perform, folder, library, ids } = setup()
  const a = folder("あ")
  const home = ids(HOME_ID)
  const [first, second, third, fourth] = home as [string, string, string, string]
  const move = (entry: string, into: string, before: string | undefined) => {
    const index = indexBefore(CORE_CATALOG, library(), into, entry, before)
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
  expect(moveClashOf(library(), "b1", { to: "folder", into: a }, NAMING)).toBeUndefined()
  expect(moveClashOf(library(), x, { to: "folder", into: a, index: 1 }, NAMING)).toBeUndefined()
  expect(moveClashOf(library(), mine, { to: "trash" }, NAMING)).toBeUndefined()
  // y の前（消える x の後ろ）へ: 上書きの位置は 1 つ前へずれる
  const index = indexBefore(CORE_CATALOG, library(), a, mine, y)
  expect(index).toBe(1)
  const clash = moveClashOf(library(), mine, { to: "folder", into: a, index }, NAMING)
  expect(clash).toEqual({
    carried: { kind: "folder", id: mine },
    numbered: "同じ 2",
    replaces: x,
    overwrite: "ok",
    indexOver: 0,
  })
  // x の前へ・末尾へ
  expect(moveClashOf(library(), mine, { to: "folder", into: a, index: 0 }, NAMING)?.indexOver).toBe(0)
  expect(moveClashOf(library(), mine, { to: "folder", into: a }, NAMING)?.indexOver).toBeUndefined()
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
  expect(moveClashOf(library(), mine, { to: "folder", into: a }, NAMING)).toMatchObject({
    replaces: book,
    overwrite: "kind",
  })
})

test("ページとバインダは、ブックと書庫ホーム・フォルダの間を落とせる（空のバインダはブックの外へ落とせない）。スライドは、紙と向きのそろうバインダと、バインダでない所へ落とせる（ドラッグも entry-move も同じ読み方）", () => {
  const library = slideWorld()
  const moves = (entry: string, into: string) => movesInto(CORE_CATALOG, library, entry, into)
  const can = (entry: string, into: string) => droppable(CORE_CATALOG, library, entry, { to: "folder", into })
  // ページ・バインダを、ブックへ入れる・ブックから出す。スライドをバインダでない所へ出す（ブックの外の 1 枚だけのバインダからなら、バインダごと）
  for (const [entry, into] of [
    ["loose", "b1"],
    ["lb", "b1"],
    ["p1", "a"],
    ["p1", HOME_ID],
    ["bd", "a"],
    ["lb", "a"],
    ["s2", "a"],
    ["s2", "b1"],
    ["s2", HOME_ID],
    ["s3", "a"],
    ["s3", "b1"],
  ] as const) {
    expect([entry, into, moves(entry, into), can(entry, into)]).toEqual([entry, into, true, true])
  }
  // 空のバインダは外へ出さない・まとまらないタイプのページはバインダへ入れない・スライドは紙と向きのそろわないバインダへ入れない・同じ場所
  for (const [entry, into] of [
    ["be", "a"],
    ["be", HOME_ID],
    ["loose", "bd"],
    ["p1", "bd"],
    ["s3", "lz"],
  ] as const) {
    expect([entry, into, moves(entry, into), can(entry, into)]).toEqual([entry, into, false, false])
  }
  const home = entriesIn(library.folders, HOME_ID).map(r => r.id)
  expect(droppable(CORE_CATALOG, library, "s3", { to: "folder", into: HOME_ID, index: home.indexOf("lb") })).toBe(false)
  // ブックの外の 1 枚だけのバインダのスライドを、同じフォルダの行の間へ: 位置は、動くバインダを除いて数える
  const before = (row?: string) => indexBefore(CORE_CATALOG, library, HOME_ID, "s3", row)
  expect([before("a"), before(undefined)]).toEqual([3, 4])
  for (const index of [before("a"), before(undefined)])
    expect(droppable(CORE_CATALOG, library, "s3", { to: "folder", into: HOME_ID, index })).toBe(true)
  const moved = movedWithBinders(CORE_CATALOG, library, "s3", HOME_ID, before("a"), NAMING, () => "nb")
  expect(isMoveRefusal(moved) ? moved : entriesIn(moved.next.folders, HOME_ID).map(r => r.id)).toEqual([
    "b1",
    "loose",
    "lz",
    "lb",
    "a",
  ])
  // スライドをバインダからバインダへ（空になったブックの外のバインダは消える）
  expect(can("s2", "lb")).toBe(true)
  expect([moves("s3", "bd"), can("s3", "bd")]).toEqual([true, true])
  // ゴミ箱へは、ブックの外の物だけ
  expect(droppable(CORE_CATALOG, library, "s3", { to: "trash" })).toBe(false)
})

test("スライドでバインダを作る移動は、名前が重なっても確かめない（番号を付ける）。ブックの外の 1 枚だけのバインダから出すときは、バインダごとの移動と同じに確かめる", () => {
  const library = slideWorld([
    { folderRole: "folder", id: "c1", title: "束 - s2", lineup: [] },
    { folderRole: "folder", id: "c2", title: "外の束", lineup: [] },
  ])
  expect(moveClashOf(library, "s2", { to: "folder", into: "a" }, NAMING)).toBeUndefined()
  expect(moveClashOf(library, "s3", { to: "folder", into: "a", index: 0 }, NAMING)).toEqual({
    carried: { kind: "binder", id: "lb" },
    numbered: "外の束 2",
    replaces: "c2",
    overwrite: "kind",
    indexOver: 0,
  })
  expect(moveClashOf(library, "s3", { to: "folder", into: HOME_ID }, NAMING)).toBeUndefined()
})

// 書庫ホーム > ブック b1（p1・バインダ bd〈s2〉・空のバインダ be）・ページ loose・バインダ lb〈s3〉・lz〈縦の s4〉・フォルダ a（inA の物）
function slideWorld(inA: PlainFolder[] = []): Library {
  const slide = (id: string, rest: object = {}) => testPage(SLIDE, id, { title: id, ...rest })
  const world = libraryWith(
    [
      testBook("b1", "一", [
        drawingPage("p1"),
        testBinder("bd", "束", SLIDE, slide("s2")),
        testBinder("be", "空", SLIDE),
      ]),
    ],
    [
      { ...drawingPage("loose"), title: "外" },
      testBinder("lb", "外の束", SLIDE, slide("s3")),
      testBinder("lz", "縦の束", SLIDE, slide("s4", { orientation: "portrait" })),
    ],
  )
  const a: PlainFolder = {
    folderRole: "folder",
    id: "a",
    title: "あ",
    lineup: inA.map(f => ({ kind: "folder", id: f.id })),
  }
  const home = world.folders[HOME_ID] as HomeFolder
  return {
    pages: world.pages,
    folders: {
      ...world.folders,
      ...Object.fromEntries(inA.map(f => [f.id, f])),
      a,
      [HOME_ID]: { ...home, lineup: [...home.lineup, { kind: "folder", id: "a" }] },
    },
  }
}
