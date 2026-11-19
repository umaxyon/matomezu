// 窓を開いたときのアクション（runsAtWindowStart）: 言語を選んでいなければ窓の言語を書き、選んであれば書かない
import { expect, test } from "bun:test"
import { newStore } from "../support"

const LANG = "@matomezu/base:lang"

test("窓を開くと、言語を選んでいなければ窓の言語を利用者の設定に書き、選んであれば書かない", () => {
  const fresh = newStore({ lang: "ja" })
  fresh.startWindow()
  expect(fresh.state.getState().settings).toEqual({ [LANG]: "matomezu:ja" })
  const chosen = newStore({ lang: "ja", settings: { [LANG]: "matomezu:en" } })
  chosen.startWindow()
  expect(chosen.state.getState().settings).toEqual({ [LANG]: "matomezu:en" })
})
