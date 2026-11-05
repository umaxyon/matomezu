// 印刷（host-client/print.ts）: 画面が印刷を頼むたびに刷り、頼まなければ刷らない
import { expect, test } from "bun:test"
import { followPrint } from "../../web/src/host-client/print"
import { newStore } from "../support"

test("印刷を頼むたびに 1 回刷り、ほかの変化では刷らない。やめたら刷らない", () => {
  const store = newStore()
  let printed = 0
  const stop = followPrint(store, { print: () => printed++ })
  store.actions.focusStage("s1")
  expect(printed).toBe(0)
  store.actions.requestPrint()
  store.actions.requestPrint()
  expect(printed).toBe(2)
  stop()
  store.actions.requestPrint()
  expect(printed).toBe(2)
})
