// ex16（matomezu ペイロードを送り、レシーバーで受ける）で、送るとかぞえが作られ、レシーバーは直に行えず、届いた 1 通からだけ行えるのを確かめる（常駐が行う鎖は Go の receiver_test.go）
import { expect, test } from "bun:test"
import { BUILTIN, BUILTIN_CONTROL_CENTER, createMatomezu } from "matomezu/testing"
import EX16 from ".."

const make = () =>
  createMatomezu({
    plugins: [...BUILTIN, EX16],
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })

test("送ると、かぞえが作られる", () => {
  const instance = make()
  const payloads = [{ to: { receiver: "ex16:tally-receive" }, id: "e1", args: { n: 1 } }]
  const sent = instance.actions.perform("ex16:tally-send", { payloads })
  const tally = sent.ok ? (sent.result as { tally: string }).tally : ""
  expect(instance.state.getState().records["ex16:tally"]?.[tally]).toEqual({ id: tally, count: 0, log: [] })
})

test("レシーバーを直に行えば断る", () => {
  const { perform } = make().actions
  expect(perform("ex16:tally-receive", { n: 1 })).toMatchObject({ ok: false, reason: "refused" })
  expect(perform("ex16:tally-undelivered", { envelope: "e1", reason: "refused" })).toMatchObject({ ok: false })
})

test("名指したレシーバーが印を持たなければ、送るアクションごと断る", () => {
  const { perform } = make().actions
  const wrong = [{ to: { receiver: "ex16:tally-send" }, id: "e1", args: {} }]
  expect(perform("ex16:tally-send", { payloads: wrong })).toMatchObject({ ok: false, reason: "refused" })
})
