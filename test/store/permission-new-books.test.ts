// 認可ステップの行った後の確かめ（keeps）は、一覧が対象のアクションで新しく増えたブックも見る（前のブックは無い）
import { expect, test } from "bun:test"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"

test("keeps だけを書いた認可ステップでも、そのタイプのブックを作るのを止められる。ほかのタイプは作れる", () => {
  const kit = pluginKit("@ex/no-tree", defineMessages({ noTree: { en: "No tree", ja: "ツリーは作らない" } }))
  const seen: { before: unknown; added: boolean }[] = []
  const store = createMatomezu({
    home: "@matomezu/master:master",
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
            aiDescription: "no tree book is made",
            denies: () => false,
            keeps: ({ before, after, changes }) => {
              if (changes.added) seen.push({ before, added: changes.added })
              return !(changes.added && after?.type === "@matomezu/tree:tree")
            },
          }),
        ],
      }),
    ],
  })
  const count = () => Object.keys(store.state.getState().books).length
  const was = count()
  expect(store.actions.perform("@matomezu/base:book-create", { title: "木", type: "@matomezu/tree:tree" })).toEqual({
    ok: false,
    reason: "denied",
    permission: "@ex/no-tree:no-tree",
  })
  expect(count()).toBe(was)
  expect(seen).toEqual([{ before: undefined, added: true }])
  expect(
    store.actions.perform("@matomezu/base:book-create", { title: "図", type: "@matomezu/drawing:drawing" }).ok,
  ).toBe(true)
  expect(count()).toBe(was + 1)
})
