// 作るブックと認可ステップ: 行った後の確かめ（keeps）は、一覧が対象のアクションで新しく増えたブックも見る（前のブックは無い）。
// 行う前は、空のブックで問う

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"

test("keeps だけを書いた認可ステップでも、そのタイプのページを入れたブックを作るのを止められる。ほかのタイプは作れる", () => {
  const kit = pluginKit("@ex/no-tree", defineMessages({ noTree: { en: "No tree", ja: "ツリーは作らない" } }))
  const seen: { before: unknown; added: boolean }[] = []
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
    plugins: [
      ...BUILTIN,
      kit.plugin({
        permissions: [
          kit.definePermission({
            id: "no-tree",
            title: "noTree",
            aiDescription: "no book is made with a tree page",
            denies: () => false,
            keeps: c => {
              if (c.kind !== "book") return true
              const { before, after, changes } = c
              if (changes.added) seen.push({ before, added: changes.added })
              return !(changes.added && after && pagesOf(after).some(p => p.type === "@matomezu/tree:tree"))
            },
          }),
        ],
      }),
    ],
  })
  const count = () => Object.keys(store.state.getState().books).length
  const was = count()
  expect(
    store.actions.perform("@matomezu/base:book-create", {
      title: "木",
      page: { type: "@matomezu/tree:tree", fields: { root: { caption: "根" } } },
    }),
  ).toEqual({
    ok: false,
    reason: "denied",
    permission: "@ex/no-tree:no-tree",
  })
  expect(count()).toBe(was)
  expect(seen).toEqual([{ before: undefined, added: true }])
  expect(
    store.actions.perform("@matomezu/base:book-create", { title: "図", page: { type: "@matomezu/drawing:drawing" } })
      .ok,
  ).toBe(true)
  expect(count()).toBe(was + 1)
})
