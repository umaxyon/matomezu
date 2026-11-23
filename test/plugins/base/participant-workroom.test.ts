// 参加ダイアログと参加者リストの見方: 引き継げるワークルーム（空室か、いる参加者が生きていないワークルーム）と、名前が使われているか、画面に出すモデル、ビジターの行と参加者区分

import { expect, test } from "bun:test"
import { shownModel } from "../../../web/src/plugins/base/participant/live"
import {
  isAdminParticipant,
  participantCategory,
  visitorName,
  visitorRows,
  workroomRows,
} from "../../../web/src/plugins/base/participant/rows"
import { nameInUse, occupantOf, takeable } from "../../../web/src/plugins/base/participant/workroom"

const room = (id: string, name: string) => ({ id, name, bird: "inko", createdAt: "t" }) as never
const joined = (id: string, workroom: string) => ({ id, state: "joined", workroom }) as never
const rooms = [room("r1", "桜"), room("r2", "梅"), room("r3", "松")]
const people = [joined("a", "r1"), joined("b", "r2")]
const alive = (calledAt: string | undefined) => calledAt === "now"

test("引き継げるワークルームは、空室と、いる参加者が生きていないワークルーム。生きている参加者のいるワークルームは引き継げない", () => {
  expect(takeable(rooms, people, { a: "now", b: "old" }, alive, 0).map(r => r.id)).toEqual(["r2", "r3"])
  expect(takeable(rooms, people, {}, alive, 0).map(r => r.id)).toEqual(["r1", "r2", "r3"])
})

test("ワークルームにいる参加者を引く。名前が使われているかは、前後の空白を除いた名前で、空の名前は使われていない", () => {
  expect(occupantOf(people, rooms[0] as never)?.id).toBe("a")
  expect(occupantOf(people, rooms[2] as never)).toBeUndefined()
  expect(nameInUse(rooms, " 桜 ")?.id).toBe("r1")
  expect(nameInUse(rooms, "竹")).toBeUndefined()
  expect(nameInUse(rooms, "  ")).toBeUndefined()
})

test("画面に出すモデルは、フックが知らせたモデルを先に、無ければ参加を頼んだときのモデル", () => {
  const p = { id: "a", model: "opus" } as never
  expect(shownModel(p, { model: "sonnet", branch: "main" })).toBe("sonnet")
  expect(shownModel(p, { branch: "main" })).toBe("opus")
  expect(shownModel(p, undefined)).toBe("opus")
})

test("ビジターの行は、ワークルームを持たない受け入れ済みの参加者だけを参加した順に並べ、ワークルームの行には入れない。参加者区分はワーカー・ビジター（管理者の印が指すワークルームの参加者もワーカー）", () => {
  const visitor = (id: string, joinedAt: string, sessionName = "") =>
    ({ id, state: "visitor", ai: "claude", model: "opus", env: "e", sessionName, joinedAt }) as never
  const all = [...people, visitor("v2", "2", "D92"), visitor("v1", "1"), { id: "q", state: "requested" } as never]
  const rows = visitorRows({ participants: all, ready: ["v1"], live: {}, calls: { v2: "now" } })
  expect(rows.map(r => [r.participant.id, r.state, r.calledAt])).toEqual([
    ["v1", "ready", undefined],
    ["v2", "preparing", "now"],
  ])
  expect(visitorName(rows[1]?.participant as never)).toBe("claude / D92")
  expect(visitorName(rows[0]?.participant as never)).toBe("claude")
  const rooms3 = workroomRows({ rooms, participants: all, admin: "r1", ready: [], live: {}, calls: {}, activities: {} })
  expect(rooms3.map(r => r.participant?.id)).toEqual(["a", "b", undefined])
  expect(rooms3[0]?.admin).toBe(true)
  expect(participantCategory(people[0] as never)).toBe("worker")
  expect(participantCategory(people[1] as never)).toBe("worker")
  expect(participantCategory(all[2] as never)).toBe("visitor")
  expect(participantCategory({ id: "q", state: "requested" } as never)).toBeUndefined()
  expect([people[0], people[1], all[2]].map(p => isAdminParticipant(p as never, "r1"))).toEqual([true, false, false])
})
