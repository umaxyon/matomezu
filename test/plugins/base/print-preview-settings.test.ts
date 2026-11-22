// 印刷プレビューの設定の組（設定の定義の printPreview。plugins/base/print-preview/settings.ts）と、それを変える print-preview-update・book-update
import { expect, test } from "bun:test"
import { z } from "zod"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { outermostSettingDefs } from "../../../web/src/plugins/base/book-settings"
import { createMatomezu } from "../../../web/src/store/create"
import { pluginKit } from "../../../web/src/store/kit"
import { definePlugin } from "../../../web/src/store/plugin"
import { createMatomezuInstance } from "../../../web/src/store/store"
import { SAMPLE_BOOKS } from "../../sample-books"
import { sequence } from "../../support"

const ex = pluginKit("ex-print", { Margin: { en: "Margin" } })
const MARGIN = ex.defineSetting({
  id: "margin",
  holder: "outermost",
  title: "Margin",
  schema: z.enum(["narrow", "wide"]),
  default: "narrow",
  printPreview: true,
})
const PLUGIN = definePlugin(ex.plugin({ settings: [MARGIN] }))

const storeWith = () =>
  createMatomezuInstance({
    plugins: [...BUILTIN, PLUGIN],
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
  })

test("追加プラグインの printPreview の項目は印刷プレビューの組に入り、print-preview-update が変える。book-update は理由を添えて断る", () => {
  const store = storeWith()
  const catalog = store.catalog.core
  expect(outermostSettingDefs(catalog, "print-preview").map(d => d.id)).toContain(MARGIN.id)
  expect(outermostSettingDefs(catalog).map(d => d.id)).not.toContain(MARGIN.id)
  const settings = () => (store.state.getState().books.b1 as { settings?: object }).settings
  const done = store.actions.perform("@matomezu/base:print-preview-update", {
    entry: "b1",
    settings: { [MARGIN.id]: "wide" },
  })
  expect(done.ok).toBe(true)
  expect(settings()).toEqual({ [MARGIN.id]: "wide" })
  const refused = store.actions.perform(
    "@matomezu/base:book-update",
    { settings: { [MARGIN.id]: "narrow" } },
    {
      book: "b1",
    },
  )
  expect(refused).toMatchObject({ ok: false, reason: "refused" })
  expect((refused as { detail?: string }).detail).toContain(`${MARGIN.id} is not a setting this action changes`)
  expect((refused as { detail?: string }).detail).toContain("print preview setting")
  // 形に合わない値も、どの項目かを添えて断る
  const bad = store.actions.perform("@matomezu/base:print-preview-update", {
    entry: "b1",
    settings: { [MARGIN.id]: "huge" },
  })
  expect((bad as { detail?: string }).detail).toContain(MARGIN.id)
  expect(settings()).toEqual({ [MARGIN.id]: "wide" })
})

test("printPreview はブックが持つ設定の項目だけが書ける（ページの項目・利用者の設定の項目に書けば台帳アセンブルで E129）", () => {
  const onPage = pluginKit("ex-print-page", { Margin: { en: "Margin" } })
  const PAGE_MARGIN = onPage.defineSetting({
    id: "margin",
    holder: "page",
    title: "Margin",
    schema: z.enum(["narrow", "wide"]),
    printPreview: true,
  })
  const broken = definePlugin(onPage.plugin({ settings: [PAGE_MARGIN] }))
  expect(() => createMatomezu({ plugins: [...BUILTIN, broken], partial: true })).toThrow(/E129/)
  const USER_MARGIN = onPage.defineSetting({
    id: "user-margin",
    title: "Margin",
    schema: z.enum(["narrow", "wide"]),
    default: "narrow",
    printPreview: true,
  })
  const brokenUser = definePlugin(onPage.plugin({ userSettings: [USER_MARGIN] }))
  expect(() => createMatomezu({ plugins: [...BUILTIN, brokenUser], partial: true })).toThrow(/E129/)
})
