import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { BOX_LOOK } from "../../web/src/plugins/books/drawing/box/size"
import type { ListRow } from "../../web/src/plugins/books/drawing/list"
import { LIST_SIZE, listLayout } from "../../web/src/plugins/books/drawing/list/size"
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

test("行の高さはそろえる: 全部の行の本文の行数のうち一番多い数と 5 行の小さい方まで本文を出し、本文の無い行も同じ高さ", () => {
  const row = (caption: string, body: string): ListRow => ({
    id: caption,
    item: "list.row",
    props: { caption, rule: true, body, captionAlign: "left", bodyAlign: "left" },
  })
  const two = listLayout([row("a", "一\n二"), row("b", "")], 240, false)
  expect(two.lines).toBe(2)
  expect(two.rows[0]!.body).toEqual(["一", "二"])
  expect(two.rows[1]).toEqual({ body: [], rule: false })
  const long = listLayout([row("a", "あ".repeat(400)), row("b", "")], 240, false)
  expect(long.lines).toBe(5)
  expect(long.rows[0]!.body.at(-1)).toMatch(/…$/)
  expect(long.height).toBe(two.height + 3 * BOX_LOOK.line)
  // チェックリストなら印の分だけ狭く、折り返しが増える
  const narrow = listLayout([row("a", "あ".repeat(16))], 240, false).lines
  expect(listLayout([row("a", "あ".repeat(16))], 240, true).lines).toBeGreaterThanOrEqual(narrow)
})
