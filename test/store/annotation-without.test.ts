// タイプが使わせないアノテーションの種類（annotations.without）: 伝言とマークを外したタイプのブックには付けられず、右クリックのコマンドも出さない
import { expect, test } from "bun:test"
import { definePageType } from "../../web/src/core/def/page-type"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"

const PLAIN = definePageType({
  id: "plain:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  items: { allowed: [] },
  actions: {},
  annotations: { without: ["@matomezu/base:note", "@matomezu/base:mark"] },
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper", // 画面に出さないので、見せ方は表にあるものを借りる
  tokens: [],
})

function ready() {
  const store = createMatomezu({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    newId: () => "n1",
  })
  store.use([definePlugin({ id: "plain", pageTypes: [PLAIN] })])
  createBookIn(store, "s1", { title: "メモ" })
  return store
}

test("伝言とマークを外したタイプのブックには、伝言もマークも付けられない", () => {
  const store = ready()
  const on = { book: "n1" }
  expect(store.actions.perform("@matomezu/base:note-add", { anchors: ["x"], text: "x" }, on).ok).toBe(false)
  expect(store.actions.perform("@matomezu/base:mark-add", { anchors: ["x"], kind: "inko" }, on).ok).toBe(false)
})

test("伝言とマークを外したタイプのブックでは、右クリックの「AIに伝言」「AIに示す」を出さない", () => {
  const store = ready()
  const shown = () =>
    ["@matomezu/base:note-new", "@matomezu/base:mark-new"].map(id =>
      isShown(store, store.state.getState(), "s1", id as never),
    )
  expect(shown()).toEqual([false, false])
})
