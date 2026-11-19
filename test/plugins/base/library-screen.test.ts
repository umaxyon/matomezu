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

test("書庫のスクリーンから選ぶ: 「画面を分割」なら空のステージ、「書庫を開く」ならカレントのステージ、コントロールセンターから開いた書庫なら新しいブックスクリーンに開き、書庫のスクリーンを閉じる", () => {
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
  // 分けずに「書庫を開く」: 下に出て、選ぶとカレントのステージ（右の b3）のブックを替え、書庫は閉じる
  store.actions.command(stages()[1]?.id ?? "", "@matomezu/base:library-open")
  expect(open().arrangementValue).toMatchObject({ screens: [expect.any(String), libs()[0]?.id] })
  store.actions.command(libs()[0]?.id ?? "", "@matomezu/base:library-entry-open", { entry: "b4" })
  expect(libs()).toHaveLength(0)
  expect(stages().map(st => st.opened !== null && "book" in st.opened && st.opened.book)).toEqual(["b1", "b4"])
  // コントロールセンターから「書庫を開く」: 窓いっぱい。選ぶと新しいブックスクリーンに開いて書庫のスクリーンを閉じる
  const center = open().screens.find(s => s.stages === undefined)?.id ?? ""
  store.actions.makeScreenCurrent(center)
  store.actions.command(center, "@matomezu/base:library-open")
  expect(open().arrangement).toBe("@matomezu/base:one-screen")
  expect(open().order.at(-1)).toBe(libs()[0]?.id)
  store.actions.command(libs()[0]?.id ?? "", "@matomezu/base:library-entry-open", { entry: "b5" })
  expect(libs()).toHaveLength(0)
})

test("下に出した書庫のスクリーンの帯: 閉じると空のステージも閉じて 1 枚に戻り、広げると空のステージを閉じて書庫のスクリーンを窓いっぱいに出す", () => {
  const open = () => store.state.getState().window
  const store = newStore()
  const lib = () => open().screens.find(s => s.def === "@matomezu/base:library-screen")?.id ?? ""
  const stages = () => open().screens.flatMap(s => s.stages?.stages ?? [])
  store.actions.command("s1", "@matomezu/base:stage-split")
  expect(store.actions.command(lib(), "@matomezu/base:library-screen-close")).toBe(true)
  expect(lib()).toBe("")
  expect(stages()).toHaveLength(1)
  expect(open().arrangement).toBe("@matomezu/base:one-screen")
  store.actions.command("s1", "@matomezu/base:stage-split")
  const expanded = lib()
  expect(store.actions.command(expanded, "@matomezu/base:library-screen-expand")).toBe(true)
  expect(stages()).toHaveLength(1)
  expect(open().arrangement).toBe("@matomezu/base:one-screen")
  expect(open().order.at(-1)).toBe(expanded)
})

test("ブックスクリーンを閉じる: 閉じて、前にカレントだったスクリーン（コントロールセンター）に戻る", () => {
  const open = () => store.state.getState().window
  const store = newStore()
  const book = open().screens.find(s => s.stages !== undefined)?.id ?? ""
  const center = open().screens.find(s => s.stages === undefined)?.id ?? ""
  expect(store.actions.command("s1", "@matomezu/base:book-screen-close")).toBe(true)
  expect(open().screens.map(s => s.id)).not.toContain(book)
  expect(open().order.at(-1)).toBe(center)
})
