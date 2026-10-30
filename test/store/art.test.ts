// シェイプ（@matomezu/art）: 図面に置け、絵は決まった大きさで、キャプションは足元で幅に合わせて折り返す。変えられるのは幅だけ
import { expect, test } from "bun:test"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { panelOf, toolboxOf } from "../../web/src/plugins/base/toolbox/toolbox"
import { ART_ITEMS, DB, PERSON } from "../../web/src/plugins/items/art/art"
import { PICTURES } from "../../web/src/plugins/items/art/pictures"
import { ART_LOOK, artHeight, minWidth } from "../../web/src/plugins/items/art/size"
import { CORE_CATALOG, newStore } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
type Store = ReturnType<typeof ready>
const book = (store: Store) => store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
const at = (store: Store, id: string) => shapesOf(book(store).pages[0]!).find(i => i.id === id)!
const place = (store: Store, item: string, props: Record<string, unknown>) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item, at: { x: 100, y: 100 }, props },
    { book: "b1" },
  )
const resize = (store: Store, item: string, size: { w?: number; h?: number; y?: number }) =>
  store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item, ...size }, { book: "b1" })
const update = (store: Store, item: string, props: Record<string, unknown>) =>
  store.actions.perform("@matomezu/paper:item-update", { page: "p1", item, props }, { book: "b1" })

test("図面のツールボックスは箱とリストとデータのボタンで、シェイプ 15 はシェイプパネルに並ぶ（8 つの形は図面には無い）", () => {
  const store = ready()
  expect(toolboxOf(CORE_CATALOG, book(store))).toEqual([
    "@matomezu/box:shape-nest-box",
    "@matomezu/list:shape-list",
    "@matomezu/data:shape-data",
  ])
  expect(panelOf(CORE_CATALOG, book(store))).toEqual(ART_ITEMS)
  expect(ART_ITEMS).toHaveLength(15)
})

test("シェイプの高さは、絵と、幅で折り返したキャプションの行から決まる。置いたときの幅はキャプションが 1 行で見える幅（上限 160px）", () => {
  const store = ready()
  const person = PICTURES.person
  expect(place(store, PERSON.item.id, { caption: "" }).ok).toBe(true)
  expect(at(store, "n1")).toMatchObject({ w: minWidth(person), h: 2 * ART_LOOK.padY + person.size.h })
  expect(place(store, DB.item.id, { caption: "とても長い名前のデータベースのキャプション" }).ok).toBe(true)
  const db = at(store, "n2")
  expect(db.w).toBe(ART_LOOK.maxW)
  expect(db.h).toBe(artHeight(PICTURES.db, "とても長い名前のデータベースのキャプション", ART_LOOK.maxW))
  expect(db.h).toBeGreaterThan(2 * ART_LOOK.padY + PICTURES.db.size.h + ART_LOOK.gap + ART_LOOK.line)
})

test("大きさを変えると幅だけが変わり、高さはその幅で折り返したキャプションから決まる（h と y は使わない）。キャプションを変えると高さが合う", () => {
  const store = ready()
  const caption = "利用者のブラウザ"
  place(store, PERSON.item.id, { caption })
  const before = at(store, "n1")
  expect(resize(store, "n1", { w: 64, h: 300, y: 50 }).ok).toBe(true)
  const narrow = at(store, "n1")
  expect(narrow).toMatchObject({ w: 64, y: before.y, h: artHeight(PICTURES.person, caption, 64) })
  expect(narrow.h).toBeGreaterThan(before.h!)
  expect(update(store, "n1", { caption: "" }).ok).toBe(true)
  expect(at(store, "n1").h).toBe(2 * ART_LOOK.padY + PICTURES.person.size.h)
})
