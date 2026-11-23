import { expect, test } from "bun:test"
import { NO_STATE } from "../../../web/src/core/def/plugin-state"
import {
  type LeftSidePanelEntry,
  openedLeftSidePanel,
  pressedLeftSidePanel,
} from "../../../web/src/plugins/base/left-side-panel/state"

// 開いているタブ（閉じていれば NO_STATE）
const tabOf = (held: ReturnType<typeof openedLeftSidePanel>) => (held === NO_STATE ? NO_STATE : held.tab)

const mail: LeftSidePanelEntry = { tab: "m", props: {} }
const outbox: LeftSidePanelEntry = { tab: "o", props: {} }

test("開くボタンを押したあとの左サイドパネル: 同じ組で同じステージなら閉じ、違えば置き換え（開くタブは、今のタブが組にあればそのまま、無ければ最初）", () => {
  const both = [mail, outbox]
  const opened = { entries: both, stage: "s1", tab: "m" }
  expect(openedLeftSidePanel(NO_STATE, both, "s1")).toEqual(opened)
  expect(pressedLeftSidePanel(opened, both, "s1")).toBe(NO_STATE)
  expect(pressedLeftSidePanel(opened, both, "s2")).toEqual({ entries: both, stage: "s2", tab: "m" })
  const onOutbox = { entries: both, stage: "s1", tab: "o" }
  expect(tabOf(pressedLeftSidePanel(onOutbox, both, "s2"))).toBe("o")
  expect(pressedLeftSidePanel(onOutbox, [mail], null)).toEqual({ entries: [mail], stage: null, tab: "m" })
  expect(pressedLeftSidePanel(NO_STATE, [], null)).toBe(NO_STATE)
  expect(tabOf(openedLeftSidePanel(opened, both, "s1", "o"))).toBe("o")
  expect(tabOf(openedLeftSidePanel(opened, both, "s1", "x"))).toBe("m")
})
