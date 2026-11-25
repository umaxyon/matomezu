// 知らせ pending-messages の読み方
import { expect, test } from "bun:test"
import { PENDING_MESSAGES } from "../../web/src/host-client/server-schemas"

test("常駐が載せない senderHost と senderHostName は、空として読む（同じホストから届いた物）", () => {
  const [read] = PENDING_MESSAGES.parse([
    { id: "m1", receiver: "r", sender: "s", senderRoom: "ひよこ", body: "b", at: "2026-11-25T00:00:00Z" },
  ])
  expect(read?.senderHost).toBe("")
  expect(read?.senderHostName).toBe("")
})
