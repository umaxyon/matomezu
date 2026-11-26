// 知らせ pending-messages の読み方
import { expect, test } from "bun:test"
import { PENDING_MESSAGES } from "../../web/src/host-client/server-schemas"

const message = {
  id: "m1",
  receiver: "r",
  senderRoom: "ひよこ",
  senderHost: "h-id",
  senderHostName: "macbook",
  body: "b",
  at: "2026-11-25T00:00:00Z",
}

test("承認待ちは、送り手のホスト id とホストエイリアスを持つ（ほかのホストから届いた物だけ）", () => {
  const [read] = PENDING_MESSAGES.parse([message])
  expect(read?.senderHost).toBe("h-id")
  expect(read?.senderHostName).toBe("macbook")
})

test("送り手のホストを載せない物は読まない", () => {
  const { senderHost: _, ...noHost } = message
  expect(PENDING_MESSAGES.safeParse([noHost]).success).toBe(false)
})
