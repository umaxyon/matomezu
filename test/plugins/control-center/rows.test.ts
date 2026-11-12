// コントロールセンターの画面の、見た目でない決め事（rows.ts・control-center.ts の frontScreenOf）: 一覧の下の 1 行の種類と、選んだ部屋の引き方、前に出す画面の既定
import { expect, test } from "bun:test"
import type { WorkroomRow } from "../../../web/src/plugins/base"
import { frontScreenOf } from "../../../web/src/plugins/control-center/control-center"
import { pickedRow, rowDetail } from "../../../web/src/plugins/control-center/rows"

const row = (state: WorkroomRow["state"], admin = false, id = "a"): WorkroomRow => ({
  room: { id, name: id, bird: "inko", createdAt: "t" },
  state,
  admin,
})

test("一覧の下の 1 行は、空室・準備中・空き。管理者の参加済みの行は何も出さない", () => {
  expect(rowDetail(row("empty"))).toBe("empty")
  expect(rowDetail(row("empty", true))).toBe("empty")
  expect(rowDetail(row("preparing"))).toBe("preparing")
  expect(rowDetail(row("ready"))).toBe("idle")
  expect(rowDetail(row("ready", true))).toBe("none")
})

test("選んだ部屋は id で引き、無くなっていれば選んでいないのと同じ", () => {
  const rows = [row("ready", false, "a"), row("empty", false, "b")]
  expect(pickedRow(rows, "b")?.room.id).toBe("b")
  expect(pickedRow(rows, "gone")).toBeUndefined()
  expect(pickedRow(rows, undefined)).toBeUndefined()
})

test("前に出す画面は、値が無ければプロジェクト", () => {
  expect(frontScreenOf(undefined)).toBe("projects")
  expect(frontScreenOf("library")).toBe("library")
})
