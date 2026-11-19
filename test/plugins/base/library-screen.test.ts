// 書庫のスクリーンの開く先（base/library/screen.ts の emptyStageAbove）: 置かれた所で決める
import { expect, test } from "bun:test"
import { emptyStageAbove } from "../../../web/src/plugins/base/library/screen"
import { NO_STAGE } from "../../../web/src/store/dialogs"

const screens = [
  { id: "book", vacant: ["s2"] },
  { id: "full", vacant: [] },
  { id: "lib", vacant: [] },
]

test("上下に並んだブックスクリーンに空のステージがあれば、そこ。並んでいない・空が無ければ NO_STAGE", () => {
  expect(emptyStageAbove(screens, { screens: ["book", "lib"], behind: [] }, "lib")).toBe("s2")
  expect(emptyStageAbove(screens, { screens: ["full", "lib"], behind: [] }, "lib")).toBe(NO_STAGE)
  expect(emptyStageAbove(screens, { screens: [], behind: [] }, "lib")).toBe(NO_STAGE)
  expect(emptyStageAbove(screens, undefined, "lib")).toBe(NO_STAGE)
})
