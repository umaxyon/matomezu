// コントロールセンターの画面の、見た目でない決め事（rows.ts・control-center.ts の frontScreenOf）: 一覧の下の 1 行の種類と、選んだ部屋の引き方、前に出す画面の既定
import { expect, test } from "bun:test"
import type { WorkroomRow } from "../../../web/src/plugins/base"
import { frontScreenOf } from "../../../web/src/plugins/control-center/control-center"
import {
  lastAccessOf,
  orderByChange,
  orderHeld,
  pickedRow,
  retreatOf,
  rowDetail,
} from "../../../web/src/plugins/control-center/rows"

const row = (state: WorkroomRow["state"], admin = false, id = "a"): WorkroomRow => ({
  room: { id, name: id, bird: "inko", createdAt: "t" },
  state,
  admin,
})

test("一覧の下の 1 行は、空室と準備中だけ文字で出し、参加済みはスロットに任せる", () => {
  expect(rowDetail(row("empty"))).toBe("empty")
  expect(rowDetail(row("empty", true))).toBe("empty")
  expect(rowDetail(row("preparing"))).toBe("preparing")
  expect(rowDetail(row("ready"))).toBe("slot")
  expect(rowDetail(row("ready", true))).toBe("slot")
})

test("選んだワークルームは id で引き、無くなっていれば選んでいないのと同じ", () => {
  const rows = [row("ready", false, "a"), row("empty", false, "b")]
  expect(pickedRow(rows, "b")?.room.id).toBe("b")
  expect(pickedRow(rows, "gone")).toBeUndefined()
  expect(pickedRow(rows, undefined)).toBeUndefined()
})

test("前に出す画面は、値が無ければプロジェクト", () => {
  expect(frontScreenOf(undefined)).toBe("projects")
  expect(frontScreenOf("library")).toBe("library")
})

test("最終アクセスの出し方は、呼ばれた時刻があればそれ、無ければ準備中か、なし", () => {
  expect(lastAccessOf({ ...row("ready"), calledAt: "2026-11-12T00:00:00.000Z" })).toBe("called")
  expect(lastAccessOf(row("preparing"))).toBe("preparing")
  expect(lastAccessOf(row("ready"))).toBe("none")
  expect(lastAccessOf(row("empty"))).toBe("none")
})

test("枠が退くのは、前に出している画面の最大化のときだけ。書庫の最大化は左の列だけ、中身の最大化は左の列とワークルームの枠。前に出していない画面の最大化は動かさない", () => {
  expect(retreatOf("library", true, false)).toEqual({ left: true, workroom: false })
  expect(retreatOf("projects", false, true)).toEqual({ left: true, workroom: true })
  expect(retreatOf("projects", true, false)).toEqual({ left: false, workroom: false }) // 書庫を最大化したまま、戻るでプロジェクトの画面が前に出た
  expect(retreatOf("library", false, true)).toEqual({ left: false, workroom: false }) // プロジェクトの画面の最大化のまま、書庫が前に出た
  expect(retreatOf("projects", false, false)).toEqual({ left: false, workroom: false })
})

test("列の並びは、管理者が先頭、次に参加済みの変化（呼ばれた時刻と参加の新しいほう）の新しい順、最後に空室と準備中。同じ時刻は作った順", () => {
  const ready = (id: string, calledAt?: string, joinedAt = "2026-11-14T00:00:00.000Z"): WorkroomRow => ({
    ...row("ready", false, id),
    participant: { id: `p-${id}`, joinedAt } as WorkroomRow["participant"],
    ...(calledAt ? { calledAt } : {}),
  })
  const rows = [
    row("empty", false, "empty"),
    ready("old", "2026-11-14T01:00:00.000Z"),
    row("preparing", false, "prep"),
    { ...ready("boss", "2026-11-14T00:30:00.000Z"), admin: true },
    ready("new", "2026-11-14T03:00:00.000Z"),
    ready("joined", undefined, "2026-11-14T02:00:00.000Z"),
    ready("tie", "2026-11-14T01:00:00.000Z"),
  ]
  expect(orderByChange(rows).map(r => r.room.id)).toEqual(["boss", "new", "joined", "old", "tie", "empty", "prep"])
})

test("並びを止めている間は、止めた時の並びのまま。新しく出た行は最後", () => {
  const rows = [row("ready", false, "a"), row("ready", false, "b"), row("ready", false, "c")]
  expect(orderHeld(rows, ["c", "a"]).map(r => r.room.id)).toEqual(["c", "a", "b"])
})
