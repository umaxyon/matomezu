import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { BOX_LOOK } from "../../web/src/plugins/books/drawing/box/size"
import type { ListRow } from "../../web/src/plugins/books/drawing/list"
import { LIST_SIZE, linesFor, listLayout, rowHeight } from "../../web/src/plugins/books/drawing/list/size"
import { newStore } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const items = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!.items ?? []
const list = (store: ReturnType<typeof newStore>) => {
  const found = items(store).find(i => i.item === "shape.list")!
  return found as Extract<typeof found, { item: "shape.list" }>
}
const act = (store: ReturnType<typeof newStore>, id: string, args: Record<string, unknown>) =>
  store.actions.perform(id as "row.add", { page: "p1", ...args } as never, { book: "b1" })
const place = (store: ReturnType<typeof newStore>, props: Record<string, unknown> = {}) =>
  store.actions.perform("item.place", { page: "p1", item: "shape.list", at: { x: 100, y: 100 }, props }, { book: "b1" })

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
  const added = act(store, "row.add", { list: "n1", props: { caption: "牛乳" } })
  expect(added.ok).toBe(true)
  act(store, "row.add", { list: "n1", props: { caption: "卵", body: "6 個" } })
  expect(list(store).children!.map(r => r.props.caption)).toEqual(["牛乳", "卵"])
  const ids = [list(store).id, ...list(store).children!.map(r => r.id)]
  expect(new Set(ids).size).toBe(3)
  const row = list(store).children![0]!.id
  expect(act(store, "row.update", { list: "n1", row, props: { caption: "豆乳", body: null } }).ok).toBe(true)
  expect(list(store).children![0]!.props.caption).toBe("豆乳")
  expect(act(store, "row.remove", { list: "n1", rows: [row] }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.caption)).toEqual(["卵"])
  expect(act(store, "row.remove", { list: "n1", rows: ["nope"] }).ok).toBe(false)
})

test("チェックはチェックリストのリストだけ。チェックリストをやめると行のチェックは消える", () => {
  const store = ready()
  place(store)
  act(store, "row.add", { list: "n1", props: { caption: "牛乳" } })
  const row = list(store).children![0]!.id
  expect(act(store, "row.check", { list: "n1", row, checked: true }).ok).toBe(false)
  store.actions.perform("item.update", { page: "p1", item: "n1", props: { checklist: true } }, { book: "b1" })
  expect(act(store, "row.check", { list: "n1", row, checked: true }).ok).toBe(true)
  expect(list(store).children![0]!.props.checked).toBe(true)
  store.actions.perform("item.update", { page: "p1", item: "n1", props: { checklist: false } }, { book: "b1" })
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
  expect(two[0]!.body).toEqual(["一", "二"])
  expect(two[1]).toMatchObject({ body: [], rule: false, height: two[0]!.height })
  const long = listLayout([row("a", "あ".repeat(400)), row("b", "")], 240, false)
  expect(long[0]!.lines).toBe(5)
  expect(long[0]!.body.at(-1)).toMatch(/…$/)
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
  expect(got[0]!.body).toEqual(["一"])
  expect(listLayout(rows, 240, false, 1).map(r => r.lines)).toEqual([1, 1, 1])
  expect(listLayout(rows, 240, false, "auto").map(r => r.lines)).toEqual([3, 3, 3])
})

test("ドラッグした高さに一番近い行数", () => {
  expect(linesFor(rowHeight(3) + 8)).toBe(3)
  expect(linesFor(rowHeight(3) + 10)).toBe(4)
  expect(linesFor(rowHeight(0))).toBe(0)
  expect(linesFor(0)).toBe(0)
  expect(linesFor(100000)).toBe(50)
})

test("row.lines で行の行数を書き換える。rows が無ければ全部の行、null なら行数を消す", () => {
  const store = ready()
  place(store)
  for (const c of ["a", "b"]) act(store, "row.add", { list: "n1", props: { caption: c } })
  const [a] = list(store).children!.map(r => r.id)
  expect(act(store, "row.lines", { list: "n1", rows: [a], lines: 2 }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.lines)).toEqual([2, undefined])
  expect(act(store, "row.lines", { list: "n1", lines: 5 }).ok).toBe(true)
  expect(list(store).children!.map(r => r.props.lines)).toEqual([5, 5])
  expect(act(store, "row.lines", { list: "n1", lines: null }).ok).toBe(true)
  expect(list(store).children!.every(r => !("lines" in r.props))).toBe(true)
  expect(act(store, "row.lines", { list: "n1", rows: ["nope"], lines: 1 }).ok).toBe(false)
})
