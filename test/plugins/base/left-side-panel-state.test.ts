import { expect, test } from "bun:test"
import {
  type LeftSidePanelEntry,
  openedLeftSidePanel,
  pressedLeftSidePanel,
} from "../../../web/src/plugins/base/left-side-panel/state"

const mail: LeftSidePanelEntry = { tab: "m", props: {} }
const outbox: LeftSidePanelEntry = { tab: "o", props: {} }

test("開くボタンを押したあとの左サイドパネル: 同じ組で同じステージなら閉じ、違えば置き換え（開くタブは、今のタブが組にあればそのまま、無ければ最初）", () => {
  const both = [mail, outbox]
  const opened = openedLeftSidePanel(undefined, both, "s1")
  expect(opened).toEqual({ entries: both, stage: "s1", tab: "m" })
  expect(pressedLeftSidePanel(opened, both, "s1")).toBeUndefined()
  expect(pressedLeftSidePanel(opened, both, "s2")).toEqual({ entries: both, stage: "s2", tab: "m" })
  const onOutbox = { entries: both, stage: "s1", tab: "o" }
  expect(pressedLeftSidePanel(onOutbox, both, "s2")?.tab).toBe("o")
  expect(pressedLeftSidePanel(onOutbox, [mail], null)).toEqual({ entries: [mail], stage: null, tab: "m" })
  expect(pressedLeftSidePanel(undefined, [], null)).toBeUndefined()
  expect(openedLeftSidePanel(opened, both, "s1", "o")?.tab).toBe("o")
  expect(openedLeftSidePanel(opened, both, "s1", "x")?.tab).toBe("m")
})
