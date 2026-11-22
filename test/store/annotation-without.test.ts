// タイプが使わせないアノテーションの種類（annotations.without）: 伝言とマークを外したタイプのページには付けられず、右クリックのコマンドも出さない

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import { definePageType } from "../../web/src/core/def/page-type"
import { HOME_ID } from "../../web/src/core/folders"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
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
  presentation: "@matomezu/paper:paper", // 画面に出さないので、プレゼンテーションは表にあるものを借りる
  tokens: [],
})

// 伝言とマークを外したタイプのページを 1 枚持つブックを開いた store と、そのページの id
function ready() {
  let n = 0
  const store = createMatomezu({
    plugins: BUILTIN,
    controlCenter: BUILTIN_CONTROL_CENTER,
    newId: () => `n${++n}`,
  })
  store.use([definePlugin({ id: "plain", pageTypes: [PLAIN] })])
  createBookIn(store, "s1", { into: HOME_ID, title: "メモ", page: { type: PLAIN.id } })
  const page = Object.values(store.state.getState().books).flatMap(pagesOf)[0]?.id ?? ""
  return { store, page }
}

test("伝言とマークを外したタイプのページには、伝言もマークも付けられない", () => {
  const { store, page } = ready()
  const on = { page }
  expect(store.actions.perform("@matomezu/base:note-add", { anchors: ["x"], text: "x" }, on)).toEqual({
    ok: false,
    reason: "not-allowed",
  })
  expect(store.actions.perform("@matomezu/base:mark-add", { anchors: ["x"], kind: "inko" }, on)).toEqual({
    ok: false,
    reason: "not-allowed",
  })
})

test("伝言とマークを外したタイプのページでは、右クリックの「AIに伝言」「AIに示す」を出さない", () => {
  const { store } = ready()
  const shown = () =>
    ["@matomezu/base:note-new", "@matomezu/base:mark-new"].map(id =>
      isShown(store, store.state.getState(), "s1", id as never),
    )
  expect(shown()).toEqual([false, false])
})
