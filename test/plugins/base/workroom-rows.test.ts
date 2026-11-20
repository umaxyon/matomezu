// ワークルームごとの行（base/participant/rows.ts の workroomRows・adminRoomOf）と、アクションが引く管理者（adminWorkroom・isAdminActor）
import { expect, test } from "bun:test"
import {
  ADMIN_MARK,
  adminWorkroom,
  isAdminActor,
  type Participant,
  WORKROOM,
  type Workroom,
} from "../../../web/src/plugins/base/participant"
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

test("アクションは、読んだ管理者の印と全部のワークルームの索引キーから管理者のワークルームを引く（決め方は adminRoomOf と同じ）", () => {
  const ctx = (workroom?: string) => ({
    records: workroom === undefined ? {} : { [ADMIN_MARK.id]: { admin: { id: "admin", workroom } } },
    keys: { [WORKROOM.id]: { a: { name: "a" }, b: { name: "b" } } },
  })
  expect(adminWorkroom(ctx("a") as never)).toBe("a")
  expect(adminWorkroom(ctx("none") as never)).toBeUndefined()
  expect(adminWorkroom(ctx("gone") as never)).toBeUndefined()
  expect(adminWorkroom(ctx() as never)).toBeUndefined()
  // 管理者のワークルームに入っている AI だけが管理者
  expect(isAdminActor({ kind: "ai", workroom: { id: "a" } }, ctx("a") as never)).toBe(true)
  expect(isAdminActor({ kind: "ai", workroom: { id: "b" } }, ctx("a") as never)).toBe(false)
  expect(isAdminActor({ kind: "user" }, ctx("a") as never)).toBe(false)
  expect(isAdminActor({ kind: "ai", workroom: { id: "a" } }, ctx("none") as never)).toBe(false)
})

test("行は、ワークルームの作業の様子を持ち、知らされていなければ unknown", () => {
  const rows = workroomRows(input({ activities: { a: "working", b: "idle" } }))
  expect(rows.map(r => r.activity)).toEqual(["working", "idle", "unknown"])
})

test("その名前で入りたいと頼んでいる要求中の参加者がいれば、行はいちばん新しい頼んだ時刻を持つ。名前の違う部屋と、受け入れた参加者は数えない", () => {
  const asking = (id: string, wantedName: string, requestedAt: string): Participant => {
    const { workroom: _, joinedAt: __, ...rest } = person(id, "c")
    return { ...rest, state: "requested", wantedName, requestedAt }
  }
  const rows = workroomRows(
    input({
      participants: [
        person("pa", "a"),
        asking("p1", "c", "2026-11-17T01:00:00.000Z"),
        asking("p2", "c", "2026-11-17T02:00:00.000Z"),
        asking("p3", "a", "2026-11-17T03:00:00.000Z"),
      ],
    }),
  )
  expect(rows.map(r => [r.room.id, r.requestedAt])).toEqual([
    ["a", "2026-11-17T03:00:00.000Z"],
    ["b", undefined],
    ["c", "2026-11-17T02:00:00.000Z"],
  ])
})
