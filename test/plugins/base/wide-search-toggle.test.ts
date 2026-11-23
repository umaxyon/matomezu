// 横断検索のタブを開閉するコマンド（Mod+Shift+F）: 定義に wideSearchToggle を書いたスクリーン（コントロールセンター）で効き、ブックスクリーンでは同じキーがブック内を検索を開く
import { expect, test } from "bun:test"
import { wideSearchEntries } from "../../../web/src/plugins/base/wide-search/tab-id"
import { isActive } from "../../../web/src/store/commands"
import { newStore, showBooks, showCenter } from "../../support"

const TOGGLE = "@matomezu/base:wide-search-toggle"
const PANEL = "@matomezu/base:left-side-panel"
const WORDS = "@matomezu/base:wide-search-words"

const panelOf = (store: ReturnType<typeof newStore>) =>
  store.state.getState().pluginValues.window[PANEL] as { entries: unknown; tab: string } | undefined

test("コントロールセンターで Mod+Shift+F を押すと横断検索のタブが開き、もう一度押すと閉じる。開いている間は押された状態", () => {
  const store = newStore()
  showCenter(store)
  const active = () => isActive(store as never, store.state.getState(), "s1", TOGGLE)
  expect(active()).toBe(false)
  expect(store.actions.pressKey("Mod+Shift+F")).toBe(true)
  expect(panelOf(store)).toMatchObject({ entries: wideSearchEntries, tab: wideSearchEntries[0]?.tab })
  expect(active()).toBe(true)
  // 開くと焦点は検索語のテキストFormにあるので、その範囲からも閉じられる
  expect(store.actions.pressKey("Mod+Shift+F", [WORDS, PANEL])).toBe(true)
  expect(panelOf(store)).toBeUndefined()
  expect(active()).toBe(false)
})

test("ブックスクリーンでは、Mod+Shift+F で横断検索のタブは開かない", () => {
  const store = newStore()
  showBooks(store)
  store.actions.pressKey("Mod+Shift+F")
  expect(panelOf(store)).toBeUndefined()
})
