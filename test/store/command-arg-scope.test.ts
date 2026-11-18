// 許可スコープを引数で決めるコマンド（permissionScope の { page }）は、出すか（isShown）も押せるか（isEnabled）も、引数のページで問う。
// 開いているページのタイプでは使えないアクションでも、引数のページのタイプで使えるなら出して、押せる
import { expect, test } from "bun:test"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { isEnabled, isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"
import { showFirstBook } from "../support"

const kit = pluginKit("@ex/scope", defineMessages({ add: { en: "Add", ja: "足す" } }))

// ディレクトリ構成図のページだけで使えるアクションを、引数 page のページで行うコマンド
const ADD_ENTRY = kit.defineCommand({
  id: "add-entry",
  title: "add",
  performs: ["@matomezu/dir:entry-add"],
  permissionScope: { page: "page" },
  run: (_ctx, _a, _arg: { page: string }) => {},
  when: () => true,
})

test("引数のページのタイプで使えるアクションなら、開いているページのタイプで使えなくても、出して押せる", () => {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
    plugins: [...BUILTIN, kit.plugin({ commands: [ADD_ENTRY] })],
  })
  showFirstBook(store)
  const added = store.actions.perform(
    "@matomezu/base:page-add",
    { type: "@matomezu/dir:dir", title: "構成", fields: { root: { name: "proj" } } },
    { book: "b1" },
  )
  expect(added.ok).toBe(true)
  const dirPage = (added as { result: { page: string } }).result.page
  const state = store.state.getState()
  const arg = { page: dirPage }
  expect(isShown(store, state, "s1", ADD_ENTRY.id as never, arg)).toBe(true)
  expect(isEnabled(store, state, "s1", ADD_ENTRY.id as never, arg)).toBe(true)
})
