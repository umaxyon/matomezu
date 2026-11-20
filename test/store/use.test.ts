import { expect, test } from "bun:test"
import { z } from "zod"
import { findPage, putPage } from "../../web/src/core/book"
import { defineAction } from "../../web/src/core/def/action"
import { definePageType } from "../../web/src/core/def/page-type"
import { stageIn } from "../../web/src/core/window"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin, withoutParts } from "../../web/src/store/plugin"
import { shown } from "../support"

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

// 機能台帳にタイプの無い間の、saved のページ（読めないページ W027。ブックは読める）
const unreadableNote = { kind: "unreadable", id: "p1", title: "メモ", code: "W027", type: "notes:note" }

const openedOf = (instance: ReturnType<typeof make>) => stageIn(instance.state.getState().window, "s1")?.opened

const make = () =>
  shown(
    createMatomezu({ plugins: BUILTIN, controlCenter: "@matomezu/control-center:control-center", savedBooks: [saved] }),
  )

test("取り込んだ追加プラグインを use で足すと組み直し、作ったときに渡したブックを新しい台帳で読み直す（足す前は読めないページだったページが、読めるページになり、開いていたステージもそのページを開く）", () => {
  const instance = make()
  expect(instance.state.getState().books.n1?.lineup as unknown).toEqual([unreadableNote])
  expect(openedOf(instance)).toEqual({ kind: "unreadable", outermost: "n1", page: "p1" }) // 足す前は、ページが読めない
  expect(instance.state.getState().partial.map(w => w.code)).toEqual(["W027"])
  expect(openedOf(instance)).toEqual({ kind: "unreadable", outermost: "n1", page: "p1" })
  expect(instance.use([notes])).toEqual({ failed: [] })
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(true)
  expect(instance.plugins.at(-1) as unknown).toBe(notes)
  expect(instance.state.getState().books.n1 as unknown).toEqual(saved)
  expect(instance.state.getState().partial).toEqual([])
  expect(openedOf(instance)).toMatchObject({ kind: "page", outermost: "n1", page: "p1", type: "notes:note" })
  const perform = instance.actions.perform as unknown as (id: string, args: unknown, on: { book: string }) => unknown
  expect(perform("notes:rename", { page: "p1", title: "新" }, { book: "n1" })).toEqual({ ok: true, result: {} })
})

test("台帳アセンブルで食い違う追加プラグインは外して、ほかは足す。use は前に足したものと置き換える（外したプラグインのタイプのページは、また読めないページになり、開いていたステージも読めないページを開く）", () => {
  const instance = make()
  instance.use([notes])
  const { failed } = instance.use([broken])
  expect(failed.map(f => f.id)).toEqual(["bad"])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(false)
  expect(instance.state.getState().books.n1?.lineup as unknown).toEqual([unreadableNote])
  expect(openedOf(instance)).toEqual({ kind: "unreadable", outermost: "n1", page: "p1" })
  expect(instance.use([broken, notes]).failed.map(f => f.id)).toEqual(["bad"])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(true)
})

test("check が投げた追加プラグインも外す（画面は見た目の台帳アセンブルで確かめる）", () => {
  const instance = make()
  const { failed } = instance.use([notes], all => {
    if (all.includes(notes)) throw new Error("no view")
  })
  expect(failed).toEqual([{ id: "notes", error: new Error("no view") }])
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
