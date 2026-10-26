import { expect, test } from "bun:test"
import { z } from "zod"
import { defineAction } from "../../web/src/core/def/action"
import { defineBookType } from "../../web/src/core/def/book-type"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"

// 取り込んだ追加プラグインの見本: 自分のブックのタイプとアクション（機能台帳の型の側には書き足さない）
const NOTE = defineBookType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("notes:note"), id: z.string().min(1) }),
  single: false,
  create: init => ({ type: "notes:note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: { add: ["notes:rename" as never] },
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/master:master",
  tokens: [],
})
const RENAME = defineAction({
  id: "notes:rename",
  title: "@matomezu/drawing:Drawing",
  aiDescription: "Rename a notes book.",
  target: "book",
  needs: [],
  args: z.strictObject({ title: z.string().min(1) }),
  run: (book, args) => ({ next: { ...book, title: args.title }, result: {} }),
})
const notes = definePlugin({ id: "notes", bookTypes: [NOTE], actions: [RENAME] })
// id の頭を付けていないので組み立てられない
const broken = { id: "bad", actions: [{ ...RENAME, id: "rename" }] } as unknown as typeof notes
const saved = { type: "notes:note", id: "n1", title: "メモ" }

const make = () => createMatomezu({ plugins: BUILTIN, home: "@matomezu/master:master", savedBooks: [saved] })

test("取り込んだ追加プラグインを use で足すと組み直し、作ったときに渡したブックを新しい台帳で読み直す", () => {
  const instance = make()
  expect(instance.state.getState().books.n1).toBeUndefined() // 足す前は読めない
  expect(instance.use([notes])).toEqual({ failed: [] })
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(true)
  expect(instance.plugins.at(-1) as unknown).toBe(notes)
  expect(instance.state.getState().books.n1 as unknown).toEqual(saved)
  const perform = instance.actions.perform as unknown as (id: string, args: unknown, on: { book: string }) => unknown
  expect(perform("notes:rename", { title: "新" }, { book: "n1" })).toEqual({ ok: true, result: {} })
})

test("組み立てられない追加プラグインは外して、ほかは足す。use は前に足したものと置き換える", () => {
  const instance = make()
  instance.use([notes])
  const { failed } = instance.use([broken])
  expect(failed.map(f => f.id)).toEqual(["bad"])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(false)
  expect(instance.state.getState().books.n1).toBeUndefined()
  expect(instance.use([broken, notes]).failed.map(f => f.id)).toEqual(["bad"])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(true)
})

test("check が投げた追加プラグインも外す（画面は見た目の組み立てで確かめる）", () => {
  const instance = make()
  const { failed } = instance.use([notes], all => {
    if (all.includes(notes)) throw new Error("no view")
  })
  expect(failed).toEqual([{ id: "notes", error: new Error("no view") }])
  expect(instance.catalog.core.actions.has("notes:rename")).toBe(false)
})
