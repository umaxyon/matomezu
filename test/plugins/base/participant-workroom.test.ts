// 参加ダイアログ: 引き継げる部屋（空室か、いる参加者が生きていない部屋）と、名前が使われているか

import { expect, test } from "bun:test"
import { nameInUse, occupantOf, takeable } from "../../../web/src/plugins/base/participant/workroom"

const room = (id: string, name: string) => ({ id, name, bird: "inko", createdAt: "t" }) as never
const joined = (id: string, workroom: string) => ({ id, state: "joined", workroom }) as never
const rooms = [room("r1", "桜"), room("r2", "梅"), room("r3", "松")]
const people = [joined("a", "r1"), joined("b", "r2")]
const alive = (calledAt: string | undefined) => calledAt === "now"

test("引き継げる部屋は、空室と、いる参加者が生きていない部屋。生きている参加者のいる部屋は引き継げない", () => {
  expect(takeable(rooms, people, { a: "now", b: "old" }, alive, 0).map(r => r.id)).toEqual(["r2", "r3"])
  expect(takeable(rooms, people, {}, alive, 0).map(r => r.id)).toEqual(["r1", "r2", "r3"])
})

test("部屋にいる参加者を引く。名前が使われているかは、前後の空白を除いた名前で、空の名前は使われていない", () => {
  expect(occupantOf(people, rooms[0] as never)?.id).toBe("a")
  expect(occupantOf(people, rooms[2] as never)).toBeUndefined()
  expect(nameInUse(rooms, " 桜 ")?.id).toBe("r1")
  expect(nameInUse(rooms, "竹")).toBeUndefined()
  expect(nameInUse(rooms, "  ")).toBeUndefined()
})
