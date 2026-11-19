import { expect, test } from "bun:test"
import { shownPageId } from "../../web/src/core/stage"
import { warningText } from "../../web/src/core/warnings"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { actionsOfPage } from "../../web/src/plugins/base/utils/page-actions"
import { isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin, warningsOf } from "../../web/src/store/plugin"
import { CORE_CATALOG, newStore, showFirstBook } from "../support"

test("アクションは、タイプが選んだアイテム・プレゼンテーションと、どのブックにも付くアクションが付いて来る。アノテーションのアクションは、その種類を使えるタイプに付いて来る。ブックが対象でないアクションは、どのタイプにも付かない", () => {
  const ids = actionsOfPage(CORE_CATALOG, { type: "@matomezu/drawing:drawing" })
  for (const id of [
    "@matomezu/base:page-add",
    "@matomezu/base:book-update",
    "@matomezu/paper:item-place",
    "@matomezu/list:row-add",
    "@matomezu/line:line-connect",
    "@matomezu/base:note-add",
    "@matomezu/base:mark-add",
  ])
    expect(ids).toContain(id)
  expect(ids).not.toContain("@matomezu/base:book-create")
  for (const id of ["@matomezu/base:settings-set", "@matomezu/base:mail-send", "@matomezu/base:participant-accept"])
    expect(ids).not.toContain(id)
})

test("ビルトインプラグインは warning を出さない", () => {
  expect(warningsOf(newStore().catalog).map(warningText)).toEqual([])
})

// 間違いを含むプラグイン: タイプの without に付いていないアクション、add にすでに付いているアクション、コマンドの performs に表に無いアクション
const notes = pluginKit("notes", { Note: { en: "Note" } })
const NOTE = notes.definePageType({
  id: "note",
  version: 1,
  title: "Note",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "portrait" },
  items: { allowed: [] },
  actions: { add: ["@matomezu/base:page-add"], without: ["@matomezu/list:row-add"] },
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
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
const SCRIBBLE = notes.defineTool({ id: "scribble", title: "Note", performs: ["notes:nothing" as never] })
const PLUGIN = definePlugin(notes.plugin({ pageTypes: [NOTE], commands: [GHOST], tools: [SCRIBBLE] }))

test("without・add・performs の間違いは warning（W001〜W003・W012）で、その行だけ効かず、プラグインのほかは動く", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN, PLUGIN],
    partial: true,
    controlCenter: "@matomezu/control-center:control-center",
  })
  showFirstBook(instance)
  expect(warningsOf(instance.catalog).map(warningText)).toEqual([
    "W012 notes: tool notes:scribble: performs notes:nothing, which is not in the catalog",
    "W001 notes: pageType notes:note: without names @matomezu/list:row-add, which is not attached to it",
    "W002 notes: pageType notes:note: add names @matomezu/base:page-add, which is already attached to it",
    "W003 notes: command notes:ghost: performs notes:nothing, which is not in the catalog",
  ])
  expect(createBookIn(instance, "s1", { title: "メモ" })).toBe(true)
  // 表に無いアクションを行うコマンドは出ない
  expect(isShown(instance, instance.state.getState(), "s1", "notes:ghost" as never)).toBe(false)
})

test("コマンドは、行うアクションが今のブックで使えなければ出ない（ブックを開いていないステージではブックの設定もページの追加も出ない）", () => {
  const store = newStore()
  const shown = (id: string) => isShown(store, store.state.getState(), "s1", id as never)
  expect(shown("@matomezu/base:book-settings")).toBe(true)
  const empty = createMatomezu({ plugins: BUILTIN, controlCenter: "@matomezu/control-center:control-center" })
  showFirstBook(empty)
  const emptyShown = (id: string) => isShown(empty, empty.state.getState(), "s1", id as never)
  expect(emptyShown("@matomezu/base:book-settings")).toBe(false)
  expect(emptyShown("@matomezu/base:page-new")).toBe(false)
  expect(emptyShown("@matomezu/base:settings-set")).toBe(true)
})

// 線を置けないタイプが線のアクションを足していても、線の入った結果はブックの形に合わないので断る（線のアクションの run は、線を使うタイプかを確かめない）
const boards = pluginKit("boards", { Board: { en: "Board" } })
const BOARD = boards.definePageType({
  id: "board",
  version: 1,
  title: "Board",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  items: { allowed: ["@matomezu/box:shape-nest-box"] },
  actions: { add: ["@matomezu/line:line-connect"] },
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper",
  tokens: [],
})

test("線を置けないタイプが line-connect を足していても、線を引くのは断る", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin(boards.plugin({ pageTypes: [BOARD] }))],
    partial: true,
    controlCenter: "@matomezu/control-center:control-center",
  })
  showFirstBook(instance)
  expect(createBookIn(instance, "s1", { title: "B" })).toBe(true)
  const id = screenOf(instance.state.getState().window).stages[0]!.opened!.book
  expect(
    instance.actions.perform("@matomezu/base:page-add", { type: "boards:board", title: "P" }, { book: id }).ok,
  ).toBe(true)
  const p = shownPageId(screenOf(instance.state.getState().window).stages[0]!.opened ?? null)!
  const place = (x: number) =>
    instance.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/box:shape-nest-box", at: { x, y: 40 }, props: { caption: "箱" } },
      { page: p },
    )
  const a = place(40)
  const b = place(400)
  expect(a.ok && b.ok).toBe(true)
  const from = a.ok ? (a.result as { item: string }).item : ""
  const to = b.ok ? (b.result as { item: string }).item : ""
  const done = instance.actions.perform("@matomezu/line:line-connect", { from, to }, { page: p })
  expect(done).toEqual({ ok: false, reason: "refused" })
})
