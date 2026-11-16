// コントロールセンターの画面の、見た目でない決め事（rows.ts・control-center.ts の frontScreenOf）: 一覧の下の 1 行の種類と、選んだ部屋の引き方、前に出す画面の既定
import { expect, test } from "bun:test"
import type { WorkroomRow } from "../../../web/src/plugins/base"
import { frontScreenOf } from "../../../web/src/plugins/control-center/control-center"
import {
  lastAccessOf,
  orderHeld,
  orderRows,
  pickedRow,
  retreatOf,
  rowDetail,
} from "../../../web/src/plugins/control-center/rows"

const row = (state: WorkroomRow["state"], admin = false, id = "a"): WorkroomRow => ({
  room: { id, name: id, bird: "inko", createdAt: "t" },
  state,
  admin,
  activity: "unknown",
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

const ready = (
  id: string,
  activity: WorkroomRow["activity"],
  calledAt?: string,
  joinedAt = "2026-11-14T00:00:00.000Z",
): WorkroomRow => ({
  ...row("ready", false, id),
  participant: { id: `p-${id}`, joinedAt } as WorkroomRow["participant"],
  activity,
  ...(calledAt ? { calledAt } : {}),
})

test("列の並びは、組の順に管理者・作業中・空き（準備中も）・空室。組の中は変化（呼ばれた時刻と参加の新しいほう）の新しい順、変化の無い行と同じ時刻は作った順", () => {
  const rows = [
    { ...row("empty", false, "empty"), activity: "working" as const }, // 前の今のチケットが残った空室
    ready("idle-old", "idle", "2026-11-14T01:00:00.000Z"),
    row("preparing", false, "prep"),
    { ...ready("boss", "idle", "2026-11-14T00:30:00.000Z"), admin: true },
    ready("work-old", "working", "2026-11-14T01:00:00.000Z"),
    ready("idle-new", "idle", "2026-11-14T03:00:00.000Z"),
    ready("work-joined", "working", undefined, "2026-11-14T02:00:00.000Z"),
    ready("work-tie", "working", "2026-11-14T01:00:00.000Z"),
  ]
  expect(orderRows(rows).map(r => r.room.id)).toEqual([
    "boss",
    "work-joined",
    "work-old",
    "work-tie",
    "idle-new",
    "idle-old",
    "prep",
    "empty",
  ])
})

test("作業の様子を答える種類が無ければ（unknown）、作業中と空きを分けずに変化の新しい順。準備中と空室はそのあと", () => {
  const rows = [
    row("empty", false, "empty"),
    row("preparing", false, "prep"),
    ready("old", "unknown", "2026-11-14T01:00:00.000Z"),
    ready("new", "unknown", "2026-11-14T03:00:00.000Z"),
  ]
  expect(orderRows(rows).map(r => r.room.id)).toEqual(["new", "old", "prep", "empty"])
})

test("並びを止めている間は、止めた時の並びのまま。新しく出た行は最後", () => {
  const rows = [row("ready", false, "a"), row("ready", false, "b"), row("ready", false, "c")]
  expect(orderHeld(rows, ["c", "a"]).map(r => r.room.id)).toEqual(["c", "a", "b"])
})
