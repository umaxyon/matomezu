// スクリーンから呼ぶコマンドの performsWith: 名乗った引数で、押す前に認可ステップにも問う。"unknown" なら、コントロールセンターにだけ問う

import { expect, test } from "bun:test"
import type { CommandId } from "../../web/src/core/catalog"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { isEnabled } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"

const TRASH = "@matomezu/base:entry-trash"

// 「API の一覧」（b5）のゴミ箱入れを止める認可ステップと、名指したブックをゴミ箱に入れるスクリーンのコマンド 2 つ（行うアクションと引数を名乗る物と、"unknown" と答える物）
function setup() {
  const kit = pluginKit(
    "@ex/keep",
    defineMessages({ keep: { en: "Keep", ja: "残す" }, trash: { en: "Trash", ja: "捨てる" } }),
  )
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
            id: "keep",
            title: "keep",
            aiDescription: "this book stays",
            denies: q => q.kind === "folder" && q.action.id === TRASH && q.folder.title === "API の一覧",
          }),
        ],
        commands: [
          kit.defineScreenCommand({
            id: "named",
            title: "trash",
            performs: [TRASH],
            run: (_, a, book: string) => void a.perform(TRASH, { entry: book }),
            performsWith: (_, book) => [{ action: TRASH, args: { entry: book } }],
            when: () => true,
          }),
          kit.defineScreenCommand({
            id: "unnamed",
            title: "trash",
            performs: [TRASH],
            run: (_, a, book: string) => void a.perform(TRASH, { entry: book }),
            performsWith: () => "unknown",
            when: () => true,
          }),
        ],
      }),
    ],
  })
  const center = store.state.getState().window.screens.find(s => s.stages === undefined)?.id as string
  const enabled = (id: string, book: string) =>
    isEnabled(store, store.state.getState(), center, `@ex/keep:${id}` as CommandId, book)
  return { enabled }
}

test("performsWith を名乗ったスクリーンのコマンドは、認可ステップが止めるブックでは押せない", () => {
  expect(setup().enabled("named", "b5")).toBe(false)
})

test("performsWith を名乗ったスクリーンのコマンドは、認可ステップが止めないブックでは押せる", () => {
  expect(setup().enabled("named", "b6")).toBe(true)
})

test('performsWith が "unknown" なら、コントロールセンターにだけ問う（認可ステップが止めるブックでも押せる）', () => {
  expect(setup().enabled("unnamed", "b5")).toBe(true)
})
