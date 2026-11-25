// 列の並びを、行が途中の様子に入った直後は前の並びで待つ（control-center/rows.ts の passingRow・settleOrder と、それを使う useSettledOrder）
import { afterEach, expect, setSystemTime, test } from "bun:test"
import { cleanup, renderHook } from "@testing-library/react"
import {
  NO_AI_UI,
  NO_BRANCH,
  NO_MODEL,
  NO_OCCUPANT,
  NOT_CALLED,
  NOT_REQUESTED,
  type WorkroomRow,
} from "../../../web/src/plugins/base"
import { PASSING_WAIT_MS, passingRow } from "../../../web/src/plugins/control-center/rows"
import { useSettledOrder } from "../../../web/src/plugins/control-center/useSettledOrder"

afterEach(() => {
  cleanup()
  setSystemTime()
})

const row = (id: string, state: WorkroomRow["state"], requestedAt?: string): WorkroomRow => ({
  room: { id, name: id, bird: "inko", createdAt: "t" },
  state,
  admin: false,
  participant: NO_OCCUPANT,
  model: NO_MODEL,
  branch: NO_BRANCH,
  aiUi: NO_AI_UI,
  calledAt: NOT_CALLED,
  wake: "none",
  requestedAt: requestedAt ?? NOT_REQUESTED,
  activity: "unknown",
})

const ids = (rows: readonly WorkroomRow[]) => rows.map(r => r.room.id)

test("途中の様子は、準備中と、その名前で頼まれている空室だけ", () => {
  expect(passingRow(row("a", "preparing"))).toBe(true)
  expect(passingRow(row("a", "empty", "2026-11-17T00:00:00.000Z"))).toBe(true)
  expect(passingRow(row("a", "empty"))).toBe(false)
  expect(passingRow(row("a", "ready"))).toBe(false)
})

test("行が途中の様子に入ると前の並びのまま待ち、待つ間に参加済みになれば、そこで 1 回だけ並べ直す", () => {
  setSystemTime(new Date("2026-11-17T00:00:00.000Z"))
  let ordered = [row("room", "ready"), row("other", "ready")]
  const { result, rerender } = renderHook(() => useSettledOrder(ordered))
  expect(ids(result.current)).toEqual(["room", "other"])
  // 前の参加者が退室し、同じ名前で頼まれた空室になる（並びの上では下へ）
  ordered = [row("other", "ready"), row("room", "empty", "2026-11-17T00:00:00.000Z")]
  rerender()
  expect(ids(result.current)).toEqual(["room", "other"])
  // 受け入れて準備中（まだ下）
  setSystemTime(new Date("2026-11-17T00:00:01.000Z"))
  ordered = [row("other", "ready"), row("room", "preparing")]
  rerender()
  expect(ids(result.current)).toEqual(["room", "other"])
  // フックが参加を伝えて参加済み（上）: 待たずにその並び
  ordered = [row("room", "ready"), row("other", "ready")]
  rerender()
  expect(ids(result.current)).toEqual(["room", "other"])
})

test("待ち終えても途中の様子のままなら、その位置へ並べ直す。途中の様子でない変化は待たない", () => {
  setSystemTime(new Date("2026-11-17T00:00:00.000Z"))
  let ordered = [row("room", "ready"), row("other", "ready")]
  const { result, rerender } = renderHook(() => useSettledOrder(ordered))
  ordered = [row("other", "ready"), row("room", "empty", "2026-11-17T00:00:00.000Z")]
  rerender()
  expect(ids(result.current)).toEqual(["room", "other"])
  setSystemTime(new Date(Date.now() + PASSING_WAIT_MS - 1))
  rerender()
  expect(ids(result.current)).toEqual(["room", "other"])
  setSystemTime(new Date(Date.now() + 1))
  rerender()
  expect(ids(result.current)).toEqual(["other", "room"])
  // 頼まれていない空室になった（途中の様子でない）: すぐ並べ直す
  ordered = [row("room", "ready"), row("other", "empty")]
  rerender()
  expect(ids(result.current)).toEqual(["room", "other"])
})
