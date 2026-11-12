// 参加ダイアログ: ワークルームの名前が、生きている受け入れ済みの参加者に使われているか

import { expect, test } from "bun:test"
import type { Participants } from "../../../web/src/core/participant"
import { workroomInUse } from "../../../web/src/plugins/base/participant/workroom"

const joined = (id: string, workroom: string) =>
  ({
    id,
    state: "joined",
    workroom,
    ai: "claude",
    model: "m",
    env: "e",
    sessionName: "",
  }) as unknown as Participants[number]

test("生きている受け入れ済みの参加者が同じ名前なら使われている。生きていない・要求中・空の名前は使われていない", () => {
  const people: Participants = [joined("a", "桜"), { ...joined("b", "梅"), state: "requested" } as Participants[number]]
  const alive = (calledAt: string | undefined) => calledAt === "now"
  expect(workroomInUse(people, { a: "now" }, " 桜 ", alive, 0)).toBe(true)
  expect(workroomInUse(people, { a: "old" }, "桜", alive, 0)).toBe(false)
  expect(workroomInUse(people, { b: "now" }, "梅", alive, 0)).toBe(false)
  expect(workroomInUse(people, { a: "now" }, "  ", alive, 0)).toBe(false)
})
