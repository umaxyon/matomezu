import { expect, test } from "bun:test"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { plainOf } from "../../web/src/plugins/base/text/rich"
import { BOX_LOOK } from "../../web/src/plugins/items/box/size"
import type { ListRow } from "../../web/src/plugins/items/list/list"
import { canCarry, dropPlace, shownOrder } from "../../web/src/plugins/items/list/rows"
import { LIST_SIZE, linesFor, listLayout, rowHeight } from "../../web/src/plugins/items/list/size"
import { newStore } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const items = (store: ReturnType<typeof newStore>) =>
  shapesOf((store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!)
const list = (store: ReturnType<typeof newStore>) => {
  const found = items(store).find(i => i.item === "@matomezu/list:shape-list")!
  return found as Extract<typeof found, { item: "@matomezu/list:shape-list" }>
}
const act = (store: ReturnType<typeof newStore>, id: string, args: Record<string, unknown>) =>
  store.actions.perform(id as "@matomezu/list:row-add", { page: "p1", ...args } as never, { book: "b1" })
const place = (store: ReturnType<typeof newStore>, props: Record<string, unknown> = {}) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/list:shape-list", at: { x: 100, y: 100 }, props },
    { book: "b1" },
  )

test("リストを置くと、幅は 240（長いキャプションならキャプションの幅）、高さは行 3 つぶんの空きで、行は無い", () => {
  const store = ready()
  expect(place(store, { caption: "やること" }).ok).toBe(true)
  expect(list(store)).toMatchObject({
    w: 240,
    h: LIST_SIZE.h,
    props: { caption: "やること", checklist: false, zebra: false },
  })
  expect(list(store).children ?? []).toEqual([])
})

test("行を足す・変える・消す。行の id はアイテムの id と重ならない", () => {
  const store = ready()
  place(store)
  const added = act(store, "@matomezu/list:row-add", { list: "n1", props: { caption: "牛乳" } })
  expect(added.ok).toBe(true)
  act(store, "@matomezu/list:row-add", { list: "n1", props: { caption: "卵", body: "6 個" } })
  expect(list(store).children!.map(r => r.props.caption)).toEqual(["牛乳", "卵"])
  const ids = [list(store).id, ...list(store).children!.map(r => r.id)]
  expect(new Set(ids).size).toBe(3)
  const row = list(store).children![0]!.id
  expect(act(store, "@matomezu/list:row-update", { list: "n1", row, props: { caption: "豆乳", body: null } }).ok).toBe(
    true,
  )
  expect(list(store).children![0]!.props.caption).toBe("豆乳")
  expect(act(store, "@matomezu/list:row-remove", { list: "n1", rows: [row] }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.caption)).toEqual(["卵"])
  expect(act(store, "@matomezu/list:row-remove", { list: "n1", rows: ["nope"] }).ok).toBe(false)
})

test("チェックはチェックリストのリストだけ。チェックリストをやめると行のチェックは消える", () => {
  const store = ready()
  place(store)
  act(store, "@matomezu/list:row-add", { list: "n1", props: { caption: "牛乳" } })
  const row = list(store).children![0]!.id
  expect(act(store, "@matomezu/list:row-check", { list: "n1", row, checked: true }).ok).toBe(false)
  store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "n1", props: { checklist: true } },
    { book: "b1" },
  )
  expect(act(store, "@matomezu/list:row-check", { list: "n1", row, checked: true }).ok).toBe(true)
  expect(list(store).children![0]!.props.checked).toBe(true)
  store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "n1", props: { checklist: false } },
    { book: "b1" },
  )
  expect("checked" in list(store).children![0]!.props).toBe(false)
})

const row = (caption: string, body: string, lines?: number): ListRow => ({
  id: caption,
  item: "list.row",
  props: {
    caption,
    rule: true,
    body,
    captionAlign: "left",
    bodyAlign: "left",
    ...(lines === undefined ? {} : { lines }),
  },
})

test("行数を持たない行はそろえる: 本文の行数の一番多い数と 5 行の小さい方まで本文を出し、本文の無い行も同じ高さ", () => {
  const two = listLayout([row("a", "一\n二"), row("b", "")], 240, false)
  expect(two.map(r => r.lines)).toEqual([2, 2])
  expect(two[0]!.body.map(plainOf)).toEqual(["一", "二"])
  expect(two[1]).toMatchObject({ body: [], rule: false, height: two[0]!.height })
  const long = listLayout([row("a", "あ".repeat(400)), row("b", "")], 240, false)
  expect(long[0]!.lines).toBe(5)
  expect(plainOf(long[0]!.body.at(-1)!)).toMatch(/…$/)
  expect(long[0]!.height).toBe(rowHeight(5))
  expect(rowHeight(5)).toBe(rowHeight(2) + 3 * BOX_LOOK.line)
  // チェックリストなら印の分だけ狭く、折り返しが増える
  const plain = listLayout([row("a", "あ".repeat(16))], 240, false)[0]!.lines
  expect(listLayout([row("a", "あ".repeat(16))], 240, true)[0]!.lines).toBeGreaterThanOrEqual(plain)
})

test("行数を持つ行は、本文の量によらずその高さ。そろえるのは行数を持たない行だけ。下書きで全部の行を決められる", () => {
  const rows = [row("a", "一", 4), row("b", "一\n二\n三"), row("c", "")]
  const got = listLayout(rows, 240, false)
  expect(got.map(r => r.lines)).toEqual([4, 3, 3])
  expect(got[0]!.body.map(plainOf)).toEqual(["一"])
  expect(listLayout(rows, 240, false, 1).map(r => r.lines)).toEqual([1, 1, 1])
  expect(listLayout(rows, 240, false, null).map(r => r.lines)).toEqual([3, 3, 3])
  expect(listLayout(rows, 240, false, "fit").map(r => r.lines)).toEqual([1, 3, 0])
  expect(listLayout(rows, 240, false, "max").map(r => r.lines)).toEqual([3, 3, 3])
})

test("ドラッグした高さに一番近い行数", () => {
  expect(linesFor(rowHeight(3) + 8)).toBe(3)
  expect(linesFor(rowHeight(3) + 10)).toBe(4)
  expect(linesFor(rowHeight(0))).toBe(0)
  expect(linesFor(0)).toBe(0)
  expect(linesFor(100000)).toBe(50)
})

test("@matomezu/list:row-lines で行の行数を書き換える。rows が無ければ全部の行、null なら行数を消す", () => {
  const store = ready()
  place(store)
  for (const c of ["a", "b"]) act(store, "@matomezu/list:row-add", { list: "n1", props: { caption: c } })
  const [a] = list(store).children!.map(r => r.id)
  expect(act(store, "@matomezu/list:row-lines", { list: "n1", rows: [a], lines: 2 }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.lines)).toEqual([2, undefined])
  expect(act(store, "@matomezu/list:row-lines", { list: "n1", lines: 5 }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.lines)).toEqual([5, 5])
  act(store, "@matomezu/list:row-update", { list: "n1", row: a, props: { body: "一\n二\n三\n四\n五\n六\n七" } })
  expect(act(store, "@matomezu/list:row-lines", { list: "n1", lines: "fit" }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.lines)).toEqual([7, 0])
  expect(act(store, "@matomezu/list:row-lines", { list: "n1", lines: "max" }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.lines)).toEqual([7, 7])
  expect(act(store, "@matomezu/list:row-lines", { list: "n1", lines: null }).ok).toBe(true)
  expect(list(store).children!.every(r => !("lines" in r.props))).toBe(true)
  expect(act(store, "@matomezu/list:row-lines", { list: "n1", rows: ["nope"], lines: 1 }).ok).toBe(false)
})

test("@matomezu/list:row-move で行を並べ替え、同じページの別のリストへ移す。チェックリストでないリストへ移すとチェックは消える", () => {
  const store = ready()
  place(store, { checklist: true })
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/list:shape-list", at: { x: 500, y: 100 }, props: {} },
    { book: "b1" },
  )
  for (const c of ["一", "二", "三"]) act(store, "@matomezu/list:row-add", { list: "n1", props: { caption: c } })
  const ids = list(store).children!.map(r => r.id)
  const captions = () => list(store).children!.map(r => r.props.caption)
  expect(act(store, "@matomezu/list:row-move", { list: "n1", row: ids[2], before: ids[0] }).ok).toBe(true)
  expect(captions()).toEqual(["三", "一", "二"])
  expect(act(store, "@matomezu/list:row-move", { list: "n1", row: ids[2] }).ok).toBe(true)
  expect(captions()).toEqual(["一", "二", "三"])
  act(store, "@matomezu/list:row-check", { list: "n1", row: ids[0], checked: true })
  expect(act(store, "@matomezu/list:row-move", { list: "n1", row: ids[0], to: "n2" }).ok).toBe(true)
  expect(captions()).toEqual(["二", "三"])
  const other = items(store).find(i => i.id === "n2") as ReturnType<typeof list>
  expect(other.children!.map(r => r.props)).toEqual([expect.objectContaining({ caption: "一" })])
  expect("checked" in other.children![0]!.props).toBe(false)
  expect(act(store, "@matomezu/list:row-move", { list: "n1", row: ids[1], before: ids[1] }).ok).toBe(false)
  expect(act(store, "@matomezu/list:row-move", { list: "n1", row: ids[1], to: "nope" }).ok).toBe(false)
})

test("見せる順: チェックリストでチェック済みを先頭か最後に寄せる（チェックリストでなければ、寄せの設定があってもデータの順）。寄せているとき、チェック済みの行は動かせない", () => {
  const row = (id: string, checked?: boolean): ListRow => ({
    id,
    item: "list.row",
    props: {
      caption: id,
      rule: true,
      body: "",
      captionAlign: "left",
      bodyAlign: "left",
      ...(checked ? { checked } : {}),
    },
  })
  const rows = [row("a"), row("b", true), row("c"), row("d", true)]
  const look = (checklist: boolean, checkedOrder: "none" | "first" | "last") => ({
    props: { caption: "", captionAlign: "center" as const, checklist, zebra: false, checkedGray: false, checkedOrder },
  })
  expect(shownOrder(look(true, "none"), rows)).toEqual([0, 1, 2, 3])
  expect(shownOrder(look(true, "first"), rows)).toEqual([1, 3, 0, 2])
  expect(shownOrder(look(true, "last"), rows)).toEqual([0, 2, 1, 3])
  expect(shownOrder(look(false, "first"), rows)).toEqual([0, 1, 2, 3])
  expect(canCarry(look(true, "first"), rows[1]!)).toBe(false)
  expect(canCarry(look(true, "first"), rows[0]!)).toBe(true)
  expect(canCarry(look(true, "none"), rows[1]!)).toBe(true)
  expect(canCarry(look(false, "last"), rows[1]!)).toBe(true)
})

test("チェック済みを寄せたリストに落とすときは、その行の組の中だけ。組の最後の後ろなら、データでもその行のすぐ後ろに入れる", () => {
  // データの順は A済・B・C済・D・E、見えている順（最後に寄せる）は B・D・E・A済・C済
  const rows = [
    { id: "b", checked: false, order: 1 },
    { id: "d", checked: false, order: 3 },
    { id: "e", checked: false, order: 4 },
    { id: "a", checked: true, order: 0 },
    { id: "c", checked: true, order: 2 },
  ]
  const above = (ids: string[]) => (id: string) => ids.includes(id)
  // チェックの無い行を、チェック済みの並びの中へ持っていっても、チェックの無い並びの最後
  expect(dropPlace(rows, "last", false, above(["c"]))).toEqual({ bar: { after: "e" } })
  // チェックの無い並びの途中
  expect(dropPlace(rows, "last", false, above(["d", "e", "a", "c"]))).toEqual({ before: "d", bar: { before: "d" } })
  // 組の最後がデータの途中なら、データでそのすぐ後ろ（D の後ろは E）
  expect(
    dropPlace(
      rows.filter(r => r.id !== "e"),
      "last",
      false,
      above([]),
    ),
  ).toEqual({ bar: { after: "d" } })
  expect(
    dropPlace(
      rows.filter(r => r.id !== "d" && r.id !== "e"),
      "last",
      false,
      above([]),
    ),
  ).toEqual({
    before: "c",
    bar: { after: "b" },
  })
  // チェック済みの行は、チェック済みの並びの中だけ
  expect(dropPlace(rows, "last", true, above(["b", "d", "e", "a", "c"]))).toEqual({ before: "a", bar: { before: "a" } })
  // 寄せていなければ、どこでも
  expect(dropPlace(rows, "none", false, above(["a", "c"]))).toEqual({ before: "a", bar: { before: "a" } })
  // 組に行が無い: 先に見える組なら並びの先頭、後に見える組なら最後の行の後ろ
  const unchecked = rows.filter(r => !r.checked)
  expect(dropPlace(unchecked, "first", true, above([]))).toEqual({ bar: { top: true } })
  expect(dropPlace(unchecked, "last", true, above([]))).toEqual({ bar: { after: "e" } })
})
