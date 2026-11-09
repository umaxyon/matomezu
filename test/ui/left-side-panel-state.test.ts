import { expect, test } from "bun:test"
import {
  type LeftSidePanelEntry,
  leftSidePanelIn,
  openedLeftSidePanel,
  pressedLeftSidePanel,
  withLeftSidePanel,
} from "../../web/src/plugins/base/left-side-panel/state"

const mail: LeftSidePanelEntry = { tab: "m", props: {} }
const outbox = (stage: string): LeftSidePanelEntry => ({ tab: "o", props: { stage } })

test("開くボタンを押したあとの左サイドパネル: 同じ組なら閉じ、違えば置き換え（開くタブは、今のタブが組にあればそのまま、無ければ最初）", () => {
  const both = [mail, outbox("s1")]
  const opened = openedLeftSidePanel(null, both)
  expect(opened).toEqual({ entries: both, tab: "m" })
  expect(pressedLeftSidePanel(opened, both)).toBeNull()
  expect(pressedLeftSidePanel(opened, [mail, outbox("s2")])).toEqual({ entries: [mail, outbox("s2")], tab: "m" })
  const onOutbox = { entries: both, tab: "o" }
  expect(pressedLeftSidePanel(onOutbox, [mail, outbox("s2")])?.tab).toBe("o")
  expect(pressedLeftSidePanel(onOutbox, [mail])).toEqual({ entries: [mail], tab: "m" })
  expect(pressedLeftSidePanel(null, [])).toBeNull()
  expect(openedLeftSidePanel(opened, both, "o")?.tab).toBe("o")
  expect(openedLeftSidePanel(opened, both, "x")?.tab).toBe("m")
})

test("外観枠の状態の左サイドパネルの項目は、読み書きでき、null で消える", () => {
  const open = { entries: [mail], tab: "m" }
  const frame = withLeftSidePanel({ other: 1 }, open)
  expect(leftSidePanelIn(frame)).toEqual(open)
  expect(withLeftSidePanel(frame, null)).toEqual({ other: 1 })
  expect(leftSidePanelIn(undefined)).toBeNull()
})
