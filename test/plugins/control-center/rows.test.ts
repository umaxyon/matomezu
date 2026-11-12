// コントロールセンターの画面の、見た目でない決め事（rows.ts・control-center.ts の frontScreenOf）: 一覧の下の 1 行の種類と、選んだ部屋の引き方、前に出す画面の既定
import { expect, test } from "bun:test"
import type { WorkroomRow } from "../../../web/src/plugins/base"
import { frontScreenOf } from "../../../web/src/plugins/control-center/control-center"
import { lastAccessOf, pickedRow, retreatOf, rowDetail } from "../../../web/src/plugins/control-center/rows"

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
