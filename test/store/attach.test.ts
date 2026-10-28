import { expect, test } from "bun:test"
import { z } from "zod"
import { actionsOf } from "../../web/src/core/perform"
import { warningText } from "../../web/src/core/warnings"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin, warningsOf } from "../../web/src/store/plugin"
import { CORE_CATALOG, newStore } from "../support"

const drawing = { type: "@matomezu/drawing:drawing" as const, id: "d", title: "D", pages: [] }

test("アクションは、タイプが選んだアイテム・見せ方・ページに付いて来る。マスターは足すアクションと外す book-update・book-lock・book-unlock で決まる", () => {
  const ids = actionsOf(CORE_CATALOG, drawing)
  for (const id of [
    "@matomezu/base:page-add",
    "@matomezu/base:book-update",
    "@matomezu/paper:item-place",
    "@matomezu/list:row-add",
    "@matomezu/line:line-connect",
  ])
    expect(ids).toContain(id)
  expect(ids).not.toContain("@matomezu/base:book-create")
  expect(actionsOf(CORE_CATALOG, MASTER_BOOK)).toEqual([
    "@matomezu/base:book-create",
    "@matomezu/base:settings-lang",
    "@matomezu/base:settings-skin",
    "@matomezu/base:settings-keys",
    "@matomezu/base:settings-text-colors",
  ])
})

test("ビルトインプラグインは warning を出さない", () => {
  expect(warningsOf(newStore().catalog).map(warningText)).toEqual([])
})

// 間違いを含むプラグイン: タイプの without に付いていないアクション、add にすでに付いているアクション、コマンドの performs に表に無いアクション
const notes = pluginKit("notes", { Note: { en: "Note" } })
const NOTE = notes.defineBookType({
  id: "note",
  version: 1,
  title: "Note",
  schema: z.strictObject({ id: z.string() }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: false,
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "portrait", perPage: true },
  },
  items: { allowed: [], defaults: [] },
  actions: { add: ["@matomezu/base:page-add"], without: ["@matomezu/list:row-add"] },
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
})
const GHOST = notes.defineCommand({
  id: "ghost",
  title: "Note",
  performs: ["notes:nothing" as never],
  run: () => {},
  when: () => true,
})
const PLUGIN = definePlugin(notes.plugin({ bookTypes: [NOTE], commands: [GHOST] }))

test("without・add・performs の間違いは warning（W001〜W003）で、その行だけ効かず、プラグインのほかは動く", () => {
  const instance = createMatomezu({ plugins: [...BUILTIN, PLUGIN], partial: true, home: "@matomezu/master:master" })
  expect(warningsOf(instance.catalog).map(warningText)).toEqual([
    "W001 notes: bookType notes:note: without names @matomezu/list:row-add, which is not attached to it",
    "W002 notes: bookType notes:note: add names @matomezu/base:page-add, which is already attached to it",
    "W003 notes: command notes:ghost: performs notes:nothing, which is not in the catalog",
  ])
  expect(createBookIn(instance, "s1", { title: "メモ", type: "notes:note" as never })).toBe(true)
  // 表に無いアクションを行うコマンドは出ない
  expect(isShown(instance, instance.state.getState(), "s1", "notes:ghost" as never)).toBe(false)
})

test("コマンドは、行うアクションが今のブックで使えなければ出ない（マスターではブックの設定もページの追加も出ない）", () => {
  const store = newStore()
  const shown = (id: string) => isShown(store, store.state.getState(), "s1", id as never)
  expect(shown("@matomezu/base:book-settings")).toBe(true)
  store.actions.command("s1", "@matomezu/base:stage-home")
  expect(shown("@matomezu/base:book-settings")).toBe(false)
  expect(shown("@matomezu/base:page-new")).toBe(false)
  expect(shown("@matomezu/base:settings-lang")).toBe(true)
})
