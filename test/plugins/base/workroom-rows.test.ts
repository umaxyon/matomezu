// ワークルームごとの行（base/participant/rows.ts の workroomRows・adminRoomOf）
import { expect, test } from "bun:test"
import type { Participant, Workroom } from "../../../web/src/plugins/base/participant"
import { adminRoomOf, workroomRows } from "../../../web/src/plugins/base/participant/rows"

const room = (id: string, name = id): Workroom => ({ id, name, bird: "inko", createdAt: "t" })
const person = (id: string, workroom: string): Participant => ({
  id,
  state: "joined",
  ai: "claude",
  model: "opus-5",
  env: "wsl-linux",
  sessionName: "",
  link: `l-${id}`,
  workroom,
  requestedAt: "t",
  joinedAt: "t",
})
const input = (over: Partial<Parameters<typeof workroomRows>[0]> = {}) => ({
  rooms: [room("a"), room("b"), room("c")],
  participants: [person("pa", "a"), person("pb", "b")],
  admin: undefined,
  ready: ["pa"],
  live: {},
  calls: {},
  activities: {},
  ...over,
})

test("行はワークルームの作った順で、管理者のワークルームだけ先頭。空室・準備中・参加済みの様子と管理者かを持つ", () => {
  const rows = workroomRows(input({ admin: "c" }))
  expect(rows.map(r => r.room.id)).toEqual(["c", "a", "b"])
  expect(rows.map(r => [r.room.id, r.state, r.admin])).toEqual([
    ["c", "empty", true],
    ["a", "ready", false],
    ["b", "preparing", false],
  ])
})

test("モデルは AI のフックが知らせた今のモデルを先に、ブランチと最後に呼ばれた時刻は知らされた参加者だけが持つ。空室は持たない", () => {
  const rows = workroomRows(
    input({ live: { pa: { model: "opus-5.5", branch: "feat/x" } }, calls: { pa: "2026-11-12T01:00:00.000Z" } }),
  )
  const a = rows.find(r => r.room.id === "a")
  expect(a).toMatchObject({ model: "opus-5.5", branch: "feat/x", calledAt: "2026-11-12T01:00:00.000Z" })
  const b = rows.find(r => r.room.id === "b")
  expect(b?.model).toBe("opus-5")
  expect(b && "branch" in b).toBe(false)
  expect(b && "calledAt" in b).toBe(false)
  const c = rows.find(r => r.room.id === "c")
  expect(c && ["model", "branch", "calledAt", "participant"].some(k => k in c)).toBe(false)
})

test("受け入れていない参加者（要求中）はワークルームに入っていないので、行に出ない", () => {
  const requested: Participant = { ...person("pc", "c"), state: "requested" }
  const { workroom: _, joinedAt: __, ...rest } = requested
  const rows = workroomRows(input({ participants: [{ ...rest, state: "requested" } as Participant] }))
  expect(rows.every(r => r.state === "empty")).toBe(true)
})

test("管理者の印が指すワークルームが無い・印が無ければ、管理者は無い", () => {
  const rooms = [room("a")]
  expect(adminRoomOf({ workroom: "a" }, rooms)).toBe("a")
  expect(adminRoomOf({ workroom: "none" }, rooms)).toBeUndefined()
  expect(adminRoomOf({ workroom: "gone" }, rooms)).toBeUndefined()
  expect(adminRoomOf(undefined, rooms)).toBeUndefined()
})

test("行は、ワークルームの作業の様子を持ち、知らされていなければ unknown", () => {
  const rows = workroomRows(input({ activities: { a: "working", b: "idle" } }))
  expect(rows.map(r => r.activity)).toEqual(["working", "idle", "unknown"])
})
