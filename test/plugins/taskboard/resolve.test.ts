// AI が指す物（レーン・タグ・ワークルーム）を id か名前から 1 つに決める: 予約語 → id → 名前（前後の空白を除いた完全一致。大文字小文字は分ける）

import { expect, test } from "bun:test"
import { resolve } from "../../../web/src/plugins/taskboard/resolve"

const lanes = [
  { id: "l1", name: "未着手" },
  { id: "l2", name: "作業中" },
  { id: "unsorted-id", name: "unsorted" }, // 予約語と同じ名前のレーン
  { id: "l4", name: "l1" }, // 別のレーンの id と同じ名前
]

test.each([
  ["id で決まる", "l2", { id: "l2" }],
  ["名前で決まる", "未着手", { id: "l1" }],
  ["前後の空白は除く", "  作業中 ", { id: "l2" }],
  ["予約語が先（同じ名前の物は id で指す）", "unsorted", { id: "unsorted" }],
  ["予約語と同じ名前の物は id で指せる", "unsorted-id", { id: "unsorted-id" }],
  ["id と名前がぶつかるときは id が先", "l1", { id: "l1" }],
] as const)("%s", (_title, ref, want) => {
  expect(resolve(ref, lanes, "lane", "unsorted")).toEqual(want)
})

test("無いときは断り、選べる名前と id を並べる。大文字小文字は分ける", () => {
  const got = resolve("作業", lanes, "lane", "unsorted")
  expect(got).toEqual({
    declined: expect.stringContaining('the lane "作業" is not there: choose 未着手 (l1), 作業中 (l2)'),
  })
  expect(resolve("Bug", [{ id: "t1", name: "bug" }], "tag", "none")).toMatchObject({ declined: expect.any(String) })
  expect(resolve("x", [], "workroom")).toEqual({ declined: 'the workroom "x" is not there: there is none' })
})

test("名前が 2 つ以上に当たるときは断り、id で指すよう添える", () => {
  const rooms = [
    { id: "a", name: "ひよこ" },
    { id: "b", name: "ひよこ" },
  ]
  expect(resolve("ひよこ", rooms, "workroom")).toEqual({
    declined: expect.stringContaining("point at one by its id (a, b)"),
  })
  expect(resolve("a", rooms, "workroom")).toEqual({ id: "a" })
})

test("見つからない断りに並べる候補は、shown で絞れる（有効なタグだけなど）", () => {
  const tags = [
    { id: "t1", name: "タスク" },
    { id: "t2", name: "古い" },
  ]
  const got = resolve("x", tags, "tag", "none", [{ id: "t1", name: "タスク" }])
  expect(got).toEqual({ declined: expect.stringContaining("choose タスク (t1)") })
  expect((got as { declined: string }).declined).not.toContain("古い")
})
