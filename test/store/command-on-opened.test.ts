// 許可スコープを書いたコマンドが行う、一覧が対象のアクションは、開いているブックのその所を変える物として扱う:
// ロック中のブックでは押せず、印刷プレビューの間も押せない。許可スコープを書かないコマンドは、止められない
import { expect, test } from "bun:test"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { isEnabled } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"

const kit = pluginKit("@ex/bin", defineMessages({ bin: { en: "Bin", ja: "捨てる" } }))

// 一覧が対象のアクション（ブックをゴミ箱に入れる）を行う、追加プラグインのコマンド。許可スコープを書いた物と、書かない物
const base = { title: "bin", performs: ["@matomezu/base:entry-trash"], run: () => {}, when: () => true } as const
const ON_OPENED = kit.defineCommand({ ...base, id: "bin-opened", permissionScope: "book" })
const ANYWHERE = kit.defineCommand({ ...base, id: "bin-anywhere" })

function ready() {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
    plugins: [...BUILTIN, kit.plugin({ commands: [ON_OPENED, ANYWHERE] })],
  })
  const enabled = (id: string) => isEnabled(store, store.state.getState(), "s1", id as never)
  return { store, enabled }
}

test("許可スコープを書いたコマンドが行う一覧が対象のアクションは、開いているブックがロック中なら押せない。書かないコマンドは押せる", () => {
  const { store, enabled } = ready()
  expect(enabled(ON_OPENED.id)).toBe(true)
  expect(store.actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(enabled(ON_OPENED.id)).toBe(false)
  expect(enabled(ANYWHERE.id)).toBe(true)
  expect(store.actions.perform("@matomezu/base:book-unlock", {}, { book: "b1" }).ok).toBe(true)
  expect(enabled(ON_OPENED.id)).toBe(true)
})

test("許可スコープを書いたコマンドが行う一覧が対象のアクションは、印刷プレビューの間は押せない。書かないコマンドは押せる", () => {
  const { store, enabled } = ready()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  expect(store.actions.command("s1", "@matomezu/base:print-preview-open")).toBe(true)
  expect(enabled(ON_OPENED.id)).toBe(false)
  expect(enabled(ANYWHERE.id)).toBe(true)
  store.actions.closePrintPreview("s1")
  expect(enabled(ON_OPENED.id)).toBe(true)
})
