// 開けるブックとゴミ箱のブック: 中身が前と同じなら前と同じ値を使い回す。使い回しはインスタンスごとで、ほかのインスタンスの変更に左右されない

import { expect, test } from "bun:test"
import { newStore } from "../support"

const settled = () => Promise.resolve()

test("ほかのインスタンスがゴミ箱を変えても、こちらのゴミ箱が変わらなければ同じ値のまま", async () => {
  const a = newStore()
  const b = newStore()
  const trash = a.state.getState().trash
  expect(b.actions.perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  await settled()
  expect("b1" in b.state.getState().trash).toBe(true)
  expect(a.actions.perform("@matomezu/base:entry-rename", { entry: "b1", title: "改名" }).ok).toBe(true)
  await settled()
  expect(a.state.getState().trash).toBe(trash)
})
