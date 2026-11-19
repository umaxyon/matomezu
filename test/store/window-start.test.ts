// 窓を開いたときのアクション（runsAtWindowStart）: settings-set が、言語を選んでいなければ窓の言語を書く引数を答え、選んであれば書かない。
// 窓は言語を書くだけで、それに合わせて足す物（システムフォルダの名前の番号など）は、常駐が行う system-folder-add が足す
import { expect, test } from "bun:test"
import { namingOf, systemFoldersInPlace } from "../../web/src/core/entries"
import { HOME_ID } from "../../web/src/core/folders"
import { SETTINGS_SET } from "../../web/src/plugins/base/settings"
import { worldOf } from "../../web/src/store/world"
import { CORE_CATALOG, newStore } from "../support"

const LANG = "@matomezu/base:lang"
const JA = { [LANG]: "matomezu:ja" }

test("窓を開くと、言語を選んでいなければ窓の言語を利用者の設定に書き、選んであれば書かない", () => {
  const fresh = newStore({ lang: "ja" })
  fresh.startWindow()
  expect(fresh.state.getState().settings).toEqual(JA)
  const chosen = newStore({ lang: "ja", settings: { [LANG]: "matomezu:en" } })
  chosen.startWindow()
  expect(chosen.state.getState().settings).toEqual({ [LANG]: "matomezu:en" })
})

test("窓が初めて言語を書くのは断らず、名前の当たる利用者の物には番号を付けない（そのあと常駐が行う system-folder-add が付ける）", () => {
  const store = newStore({ lang: "ja" })
  const { actions, state } = store
  expect(actions.perform("@matomezu/base:system-folder-add", {}).ok).toBe(true)
  const book = state.getState().folders[HOME_ID]!.lineup.find(r => r.kind === "book")!.id
  const titleOf = () => (state.getState().folders[book] as { title?: string }).title
  // 言語を選んでいない間（英語で引く）は、ドキュメントと当たらない
  expect(actions.perform("@matomezu/base:entry-rename", { entry: book, title: "ドキュメント" }).ok).toBe(true)
  store.startWindow()
  expect(state.getState().settings).toEqual(JA)
  expect(titleOf()).toBe("ドキュメント")
  expect(systemFoldersInPlace(worldOf(state.getState()), namingOf(CORE_CATALOG, JA))).toBe(false)
  expect(actions.perform("@matomezu/base:system-folder-add", {}).ok).toBe(true)
  expect(titleOf()).toBe("ドキュメント 2")
})

test("settings-set は、窓の言語の言語パックを言語の項目に、値が無いときだけ書く引数を答え、言語パックが無い言語なら行わない", () => {
  expect(SETTINGS_SET.runsAtWindowStart?.({ lang: "ja" }, CORE_CATALOG)).toEqual({
    values: { [LANG]: "matomezu:ja" },
    only: "unset",
  })
  expect(SETTINGS_SET.runsAtWindowStart?.({ lang: "fr" as "ja" }, CORE_CATALOG)).toBeNull()
})

test("settings-set の only unset は、値の無い項目だけを書き、在る値（機能台帳に無い言語パックを選んだ値も）は変えず、形の合わない値は断る", () => {
  const set = (settings: Record<string, unknown>, values: Record<string, unknown>) => {
    const store = newStore({ lang: "en", settings })
    const done = store.actions.perform("@matomezu/base:settings-set", { values, only: "unset" })
    return { ok: done.ok, settings: store.state.getState().settings }
  }
  expect(set({}, { [LANG]: "matomezu:ja" })).toEqual({ ok: true, settings: JA })
  expect(set({ [LANG]: "matomezu:en" }, { [LANG]: "matomezu:ja" }).settings).toEqual({ [LANG]: "matomezu:en" })
  expect(set({ [LANG]: "@ex/gone:fr" }, { [LANG]: "matomezu:ja" }).settings).toEqual({ [LANG]: "@ex/gone:fr" })
  expect(set({ [LANG]: "matomezu:en" }, { [LANG]: 3 }).ok).toBe(false)
  // null は、値が在れば変えず、無ければ何も変わらない
  expect(set({ [LANG]: "matomezu:en" }, { [LANG]: null }).settings).toEqual({ [LANG]: "matomezu:en" })
})
