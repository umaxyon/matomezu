// 作るブックと認可ステップ: 行った後の確かめ（keeps）は、一覧が対象のアクションで新しく増えたブックも見る（前のブックは無い）。
// 行う前は、空のブックで問う

import { expect, test } from "bun:test"
import { findPage, pagesOf } from "../../web/src/core/book"
import { HOME_ID } from "../../web/src/core/folders"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { isEnabled, isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"
import { showFirstBook } from "../support"

test("keeps だけを書いた認可ステップでも、そのタイプのページを入れたブックを作るのを止められる。ほかのタイプは作れる", () => {
  const kit = pluginKit("@ex/no-tree", defineMessages({ noTree: { en: "No tree", ja: "ツリーは作らない" } }))
  const seen: { before: unknown; added: boolean }[] = []
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
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
              if (c.kind !== "folder") return true
              const { before, after, changes } = c
              if (changes.added) seen.push({ before, added: changes.added })
              return !(changes.added && after && pagesOf(after).some(p => p.type === "@matomezu/tree:tree"))
            },
          }),
        ],
      }),
    ],
  })
  showFirstBook(store)
  const count = () => Object.keys(store.state.getState().books).length
  const was = count()
  expect(
    store.actions.perform("@matomezu/base:book-create", {
      into: HOME_ID,
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
    store.actions.perform("@matomezu/base:book-create", {
      into: HOME_ID,
      title: "図",
      page: { type: "@matomezu/drawing:drawing" },
    }).ok,
  ).toBe(true)
  expect(count()).toBe(was + 1)
})

test("認可ステップは、作るページのタイプを行う前に見られる（所の creates）。止めたタイプは、ページを足すコマンドが出たまま押せず、行っても断る。ほかのタイプは足せる", () => {
  const kit = pluginKit("@ex/no-markdown", defineMessages({ noMarkdown: { en: "No documents", ja: "文書は作らない" } }))
  const MARKDOWN = "@matomezu/markdown:markdown"
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
    plugins: [
      ...BUILTIN,
      kit.plugin({
        permissions: [
          kit.definePermission({
            id: "no-markdown",
            title: "noMarkdown",
            aiDescription: "no markdown page is made",
            denies: q => q.kind === "folder" && q.where?.creates === MARKDOWN,
            keeps: c =>
              c.kind !== "folder" ||
              !c.changes.pages.some(p => p.change === "added" && findPage(c.after!, p.id)?.page.type === MARKDOWN),
          }),
        ],
      }),
    ],
  })
  showFirstBook(store)
  const book = SAMPLE_BOOKS[0]!.id
  store.actions.openBook("s1", book)
  const command = (arg?: { type: string }) => {
    const state = store.state.getState()
    return {
      shown: isShown(store, state, "s1", "@matomezu/base:page-new", arg),
      enabled: isEnabled(store, state, "s1", "@matomezu/base:page-new", arg as never),
    }
  }
  // タイプを選ぶ前（＋のボタン）と、止めていないタイプは押せる。止めたタイプは出たまま押せない
  expect(command()).toEqual({ shown: true, enabled: true })
  expect(command({ type: "@matomezu/drawing:drawing" })).toEqual({ shown: true, enabled: true })
  expect(command({ type: MARKDOWN })).toEqual({ shown: true, enabled: false })
  expect(store.actions.perform("@matomezu/base:page-add", { type: MARKDOWN }, { book })).toEqual({
    ok: false,
    reason: "denied",
    permission: "@ex/no-markdown:no-markdown",
  })
  expect(store.actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing" }, { book }).ok).toBe(
    true,
  )
})
