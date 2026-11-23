import { expect, test } from "bun:test"
import { z } from "zod"
import { findPage, putPage } from "../../web/src/core/book"
import { defineAction } from "../../web/src/core/def/action"
import { definePageType } from "../../web/src/core/def/page-type"
import type { MatomezuError } from "../../web/src/core/errors"
import { NOTHING_OPENED } from "../../web/src/core/stage"
import { stageIn } from "../../web/src/core/window"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin, withoutParts } from "../../web/src/store/plugin"
import { savedRows, shown } from "../support"

// 取り込んだ追加プラグインの見本: 自分のページのタイプとアクション（core/catalog.ts には書き足さない）
const NOTE = definePageType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  items: { allowed: [] },
  actions: { add: ["notes:rename" as never] },
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper",
  tokens: [],
})
const RENAME = defineAction({
  id: "notes:rename",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Rename a notes page.",
  target: "book",
  permissionScope: { page: "page" },
  args: z.strictObject({ page: z.string().min(1), title: z.string().min(1) }),
  run: (book, args) => {
    const page = findPage(book, args.page)?.page
    return page ? { next: putPage(book, { ...page, title: args.title }), result: {} } : null
  },
})
const notes = definePlugin({ id: "notes", pageTypes: [NOTE], actions: [RENAME] })
// id の頭を付けていないので台帳アセンブルで食い違う
const broken = { id: "bad", actions: [{ ...RENAME, id: "rename" }] } as unknown as typeof notes
const saved = {
  id: "n1",
  title: "メモ",
  lineup: [
    { kind: "page", id: "p1", type: "notes:note", title: "メモ", paper: "@matomezu/base:a4", orientation: "landscape" },
  ],
}

const openedOf = (instance: ReturnType<typeof make>) => stageIn(instance.state.getState().window, "s1")?.opened

const make = () =>
  shown(createMatomezu({ plugins: BUILTIN, controlCenter: BUILTIN_CONTROL_CENTER, saved: savedRows([saved]) }))

test("取り込んだ追加プラグインを use で足すと組み直し、作ったときに渡したブックを新しい台帳で読み直す（足す前は読めないページを持つので読めなかったブックが、読めるブックになる）", () => {
  const instance = make()
  expect(instance.state.getState().books.n1).toBeUndefined() // 足す前は、ページのタイプが無いのでブックごと読めない
  expect(instance.state.getState().unreadable.map(w => w.code)).toEqual(["W027"])
  instance.use([notes])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(true)
  expect(instance.plugins.at(-1) as unknown).toBe(notes)
  expect(instance.state.getState().books.n1 as unknown).toEqual(saved)
  expect(instance.state.getState().unreadable).toEqual([])
  const perform = instance.actions.perform as unknown as (id: string, args: unknown, on: { book: string }) => unknown
  expect(perform("notes:rename", { page: "p1", title: "新" }, { book: "n1" })).toEqual({ ok: true, result: {} })
})

// use が投げた error（投げなければ null）
const useError = (instance: ReturnType<typeof make>, ...args: Parameters<ReturnType<typeof make>["use"]>) => {
  try {
    instance.use(...args)
    return null
  } catch (e) {
    return e as MatomezuError
  }
}

test("台帳アセンブルで食い違う追加プラグインが 1 つでもあれば、何も当てずに E317 を投げる（details は食い違った物の E318、並びの順）。ほかの物も試すので、後ろの物の食い違いも並ぶ", () => {
  const instance = make()
  instance.use([notes])
  const later = { ...broken, id: "bad2" } as unknown as typeof notes
  const error = useError(instance, [broken, notes, later])
  expect(error?.code).toBe("E317")
  expect(error?.details.map(d => [d.code, d.params.plugin])).toEqual([
    ["E318", "bad"],
    ["E318", "bad2"],
  ])
  // 前の台帳のまま（足してあった notes のブックも読めたまま）
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(true)
  expect(instance.state.getState().books.n1).toBeDefined()
})

test("use は前に足したものと置き換える（外したプラグインのタイプのページを持つブックは、また読めなくなり、開いていたステージは閉じる）", () => {
  const instance = make()
  instance.use([notes])
  instance.use([])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(false)
  expect(instance.state.getState().books.n1).toBeUndefined()
  expect(openedOf(instance) ?? NOTHING_OPENED).toBe(NOTHING_OPENED)
})

test("check が投げた追加プラグインも食い違いとして E317 を投げ、E318 の reason は check の error の文（画面は見た目の台帳アセンブルで確かめる）", () => {
  const instance = make()
  const error = useError(instance, [notes], all => {
    if (all.includes(notes)) throw new Error("no view")
  })
  expect(error?.details).toEqual([{ code: "E318", params: { plugin: "notes", reason: "no view" } }])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(false)
})

test("無効にしたプラグインは、名乗り（id・名前・概要）と文言だけを残し、定義の部品は全部外す", () => {
  const kit = pluginKit("@ex/off", { Name: { en: "Name", ja: "名前" }, About: { en: "About", ja: "概要" } })
  const plugin = kit.plugin({ title: "Name", description: "About", keys: [] })
  const off = withoutParts(plugin)
  expect(off.id).toBe("@ex/off")
  expect(off.title as string).toBe("@ex/off:Name")
  expect(off.description as string).toBe("@ex/off:About")
  expect(off.messages).toBe(plugin.messages)
  expect("keys" in off).toBe(false)
})
