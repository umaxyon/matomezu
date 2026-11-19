// 書庫のスクリーン（base/library/screen.ts・open-from.ts）: 開く先は置かれた所で決め、開いたら・「書庫を開く」で、空のステージを片付ける
import { expect, test } from "bun:test"
import { vacantStageBeside } from "../../../web/src/plugins/base/library/screen"
import { NO_STAGE } from "../../../web/src/store/dialogs"
import { newStore } from "../../support"

const screens = [
  { id: "book", vacant: ["s2"] },
  { id: "full", vacant: [] },
  { id: "lib", vacant: [] },
]

test("上下に並んだブックスクリーンに空のステージがあれば、そこ。並んでいない・空が無ければ NO_STAGE", () => {
  expect(vacantStageBeside(screens, { screens: ["book", "lib"], behind: [] }, "lib")).toBe("s2")
  expect(vacantStageBeside(screens, { screens: ["full", "lib"], behind: [] }, "lib")).toBe(NO_STAGE)
  expect(vacantStageBeside(screens, { screens: [], behind: [] }, "lib")).toBe(NO_STAGE)
  expect(vacantStageBeside(screens, undefined, "lib")).toBe(NO_STAGE)
})

test("「画面を分割」で下に出した書庫: 選ぶと空のステージに開いて書庫のスクリーンを閉じ、「書庫を開く」は空のステージを閉じて広げる", () => {
  const open = () => store.state.getState().window
  const store = newStore()
  const libs = () => open().screens.filter(s => s.def === "@matomezu/base:library-screen")
  const stages = () => open().screens.flatMap(s => s.stages?.stages ?? [])
  // 分けて、下の書庫から b3 を開く
  expect(store.actions.command("s1", "@matomezu/base:stage-split")).toBe(true)
  expect(stages()).toHaveLength(2)
  const lib = libs()[0]?.id ?? ""
  store.actions.command(lib, "@matomezu/base:library-entry-open", { entry: "b3" })
  expect(libs()).toHaveLength(0)
  expect(stages().map(st => st.opened !== null && "book" in st.opened && st.opened.book)).toEqual(["b1", "b3"])
  expect(open().arrangement).toBe("@matomezu/base:one-screen")
  // もう一度分けて「書庫を開く」: 空のステージは閉じ、書庫は 1 枚ずつで前に出る
  store.actions.closeStage(stages()[1]?.id ?? "")
  store.actions.command("s1", "@matomezu/base:stage-split")
  expect(stages()).toHaveLength(2)
  store.actions.command("s1", "@matomezu/base:library-open")
  expect(stages()).toHaveLength(1)
  expect(open().order.at(-1)).toBe(libs()[0]?.id)
  expect(open().arrangement).toBe("@matomezu/base:one-screen")
  // 窓いっぱいの書庫から開くと、新しいブックスクリーンに開いて書庫のスクリーンを閉じる
  store.actions.command(libs()[0]?.id ?? "", "@matomezu/base:library-entry-open", { entry: "b4" })
  expect(libs()).toHaveLength(0)
})
