// データ（@matomezu/data）: 図面に置くと表の無いまま置かれ、data-set で表を丸ごと入れ替える。列は数か文字の型を持ち、セルは列の型に合わなければ断る
import { expect, test } from "bun:test"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { toolboxOf } from "../../web/src/plugins/base/toolbox/toolbox"
import { DATA, DATA_SIZE } from "../../web/src/plugins/items/data/data"
import { CORE_CATALOG, newStore } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
type Store = ReturnType<typeof ready>
const book = (store: Store) => store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
const at = (store: Store, id: string) =>
  shapesOf(book(store).pages[0]!).find(i => i.id === id) as unknown as Record<string, unknown>
const place = (store: Store) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: DATA.id, at: { x: 100, y: 100 }, props: {} },
    { book: "b1" },
  )
// 断る形も渡すので、引数の型は見ない
const set = (store: Store, args: { columns: unknown[]; rows: unknown[] }) =>
  store.actions.perform("@matomezu/data:data-set", { page: "p1", item: "n1", ...args } as never, { book: "b1" })

const MONTHS = {
  columns: [
    { name: "月", type: "text" },
    { name: "売上", type: "number" },
  ],
  rows: [{ cells: ["1月", 12] }, { cells: ["2月", 30] }],
}

test("図面のツールボックスに、リストの次にデータのボタンが出る", () => {
  const store = ready()
  expect(toolboxOf(CORE_CATALOG, book(store))).toEqual([
    "@matomezu/box:shape-nest-box",
    "@matomezu/list:shape-list",
    DATA.id,
  ])
})

test("置いたデータは表を持たず、見た目は表で、置いたときの大きさ", () => {
  const store = ready()
  expect(place(store).ok).toBe(true)
  const data = at(store, "n1")
  expect(data).toMatchObject({ item: DATA.id, w: DATA_SIZE.w, h: DATA_SIZE.h, props: { view: "table" } })
  expect(data.table).toBeUndefined()
})

test("data-set は表を丸ごと入れ替え、列と行に id を振って返す。id を書いた列と行は、その id を保つ", () => {
  const store = ready()
  place(store)
  const first = set(store, MONTHS)
  expect(first.ok).toBe(true)
  const ids = (first as unknown as { result: { columns: string[]; rows: string[] } }).result
  expect(ids.columns).toHaveLength(2)
  expect(ids.rows).toHaveLength(2)
  expect(at(store, "n1").table).toEqual({
    columns: [
      { id: ids.columns[0], name: "月", type: "text" },
      { id: ids.columns[1], name: "売上", type: "number" },
    ],
    rows: [
      { id: ids.rows[0], cells: ["1月", 12] },
      { id: ids.rows[1], cells: ["2月", 30] },
    ],
  })
  // 売上の列の名前を変え、1 行目を消して 1 行足す
  const second = set(store, {
    columns: [
      { id: ids.columns[0], name: "月", type: "text" },
      { id: ids.columns[1], name: "売上（万円）", type: "number" },
    ],
    rows: [{ id: ids.rows[1], cells: ["2月", 31] }, { cells: ["3月", 0] }],
  })
  expect(second.ok).toBe(true)
  const table = at(store, "n1").table as { columns: { id: string; name: string }[]; rows: { id: string }[] }
  expect(table.columns.map(c => c.id)).toEqual(ids.columns)
  expect(table.columns[1]!.name).toBe("売上（万円）")
  expect(table.rows[0]!.id).toBe(ids.rows[1]!)
  expect(new Set([...ids.columns, ...ids.rows, table.rows[1]!.id, "n1"]).size).toBe(6)
})

test("data-set は、セルが列の数と型に合わない・今の表に無い id を書いた・同じ id を 2 度書いたなら断る", () => {
  const store = ready()
  place(store)
  const cols = MONTHS.columns
  expect(set(store, { columns: cols, rows: [{ cells: ["1月", "12"] }] }).ok).toBe(false) // 数の列に文字
  expect(set(store, { columns: cols, rows: [{ cells: [1, 12] }] }).ok).toBe(false) // 文字の列に数
  expect(set(store, { columns: cols, rows: [{ cells: ["1月"] }] }).ok).toBe(false) // セルが足りない
  expect(set(store, { columns: cols, rows: [{ cells: ["1月", 12, 3] }] }).ok).toBe(false) // セルが多い
  expect(set(store, { columns: cols, rows: [{ cells: ["1月", null] }] }).ok).toBe(false) // 空のセル
  expect(set(store, { columns: [{ id: "x9", name: "月", type: "text" }], rows: [] }).ok).toBe(false) // 無い id
  expect(at(store, "n1").table).toBeUndefined()
  const ok = set(store, MONTHS) as unknown as { result: { columns: string[] } }
  const c = ok.result.columns[0]
  expect(
    set(store, {
      columns: [
        { id: c, name: "a", type: "text" },
        { id: c, name: "b", type: "text" },
      ],
      rows: [],
    }).ok,
  ).toBe(false)
})

test("列の無い data-set は表を消して No Data に戻す（行だけ書けば断る）", () => {
  const store = ready()
  place(store)
  set(store, MONTHS)
  expect(set(store, { columns: [], rows: [{ cells: [] }] }).ok).toBe(false)
  expect(set(store, { columns: [], rows: [] }).ok).toBe(true)
  expect(at(store, "n1").table).toBeUndefined()
})

test("data-set はデータでない形には断る", () => {
  const store = ready()
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/list:shape-list", at: { x: 100, y: 100 }, props: {} },
    { book: "b1" },
  )
  expect(set(store, MONTHS).ok).toBe(false)
})
