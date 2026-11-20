import { expect, test } from "bun:test"
import { definePageType } from "../../../web/src/core/def/page-type"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { hasOpenedPage } from "../../../web/src/plugins/base/utils/opened-page"
import { commandContext } from "../../../web/src/store/commands"
import { createMatomezu } from "../../../web/src/store/create"
import { definePlugin } from "../../../web/src/store/plugin"
import { shown } from "../../support"

// ページを 1 枚持つブック（そのページのタイプは notes プラグインが足す。足さなければ読めないブック）
const NOTE = definePageType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper",
  tokens: [],
})
const notes = definePlugin({ id: "notes", pageTypes: [NOTE] })
const saved = {
  id: "n1",
  title: "メモ",
  lineup: [
    { kind: "page", id: "p1", type: "notes:note", title: "メモ", paper: "@matomezu/base:a4", orientation: "landscape" },
  ],
}

// プラグイン plugins を足してから最初のブックを開いたインスタンス（足さなければ、そのブックは読めないブックなので開かない）
const make = (plugins: readonly (typeof notes)[]) => {
  const instance = createMatomezu({ plugins: BUILTIN, controlCenter: BUILTIN_CONTROL_CENTER, savedBooks: [saved] })
  if (plugins.length > 0) instance.use([...plugins])
  return shown(instance)
}
const COMMAND = "@matomezu/paper:paper-select-all"

test("ページを開いていて中身が読めれば、開いているページは ctx.page（id もそこから）", () => {
  const instance = make([notes])
  const ctx = commandContext(instance.catalog.core, null, instance.state.getState(), "s1", COMMAND)!
  expect(hasOpenedPage(ctx)).toBe(true)
  expect(hasOpenedPage(ctx) && ctx.page.id).toBe("p1")
})

test("ブックが読めないブックなら（ページのタイプが無い）、開いているページは無い", () => {
  const instance = make([])
  const ctx = commandContext(instance.catalog.core, null, instance.state.getState(), "s1", COMMAND)!
  expect(hasOpenedPage(ctx)).toBe(false)
})

test("ステージはページを開いているのに、ページの表にその行が無ければ、開いているページは無い（ステージの開いている物からは求め直さない）", () => {
  const instance = make([notes])
  const state = instance.state.getState()
  const { p1: _, ...pages } = state.pages
  const ctx = commandContext(instance.catalog.core, null, { ...state, pages }, "s1", COMMAND)!
  expect(ctx.stage.opened).toMatchObject({ kind: "page", page: "p1" })
  expect(hasOpenedPage(ctx)).toBe(false)
})
