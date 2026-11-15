import { expect, test } from "bun:test"
import {
  type LeftSidePanelEntry,
  openedLeftSidePanel,
  pressedLeftSidePanel,
} from "../../../web/src/plugins/base/left-side-panel/state"

const mail: LeftSidePanelEntry = { tab: "m", props: {} }
const outbox = (stage: string): LeftSidePanelEntry => ({ tab: "o", props: {}, stage })

test("開くボタンを押したあとの左サイドパネル: 同じ組なら閉じ、違えば置き換え（開くタブは、今のタブが組にあればそのまま、無ければ最初）", () => {
  const both = [mail, outbox("s1")]
  const opened = openedLeftSidePanel(undefined, both)
  expect(opened).toEqual({ entries: both, tab: "m" })
  expect(pressedLeftSidePanel(opened, both)).toBeUndefined()
  expect(pressedLeftSidePanel(opened, [mail, outbox("s2")])).toEqual({ entries: [mail, outbox("s2")], tab: "m" })
  const onOutbox = { entries: both, tab: "o" }
  expect(pressedLeftSidePanel(onOutbox, [mail, outbox("s2")])?.tab).toBe("o")
  expect(pressedLeftSidePanel(onOutbox, [mail])).toEqual({ entries: [mail], tab: "m" })
  expect(pressedLeftSidePanel(undefined, [])).toBeUndefined()
  expect(openedLeftSidePanel(opened, both, "o")?.tab).toBe("o")
  expect(openedLeftSidePanel(opened, both, "x")?.tab).toBe("m")
})
