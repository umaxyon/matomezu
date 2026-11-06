// マークダウンのブック: 見せ方はステージに紙を置かない、どのページもいつも可変ページで下へ増やす（可変ページにする・やめるは選べない）、
// ペインの並べ方はステージの画面の状態で、ペインの分割のコマンドで変える
import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { growOf } from "../../web/src/plugins/base"
import { createBookIn } from "../../web/src/plugins/base/book-new/create-book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { paneLayoutOf } from "../../web/src/plugins/books/markdown/panes"
import { sourceEdit } from "../../web/src/plugins/books/markdown/source-edit"
import { isActive, isShown } from "../../web/src/store/commands"
import type { DoneAction as Done } from "../../web/src/store/store"
import { newStore } from "../support"

const markdownStore = (options: Parameters<typeof newStore>[0] = {}) => {
  const store = newStore(options)
  createBookIn(store, "s1", { title: "メモ", type: "@matomezu/markdown:markdown" })
  addPageIn(store, "s1", { title: "ページ 1" })
  const id = store.state.getState().workspace.stages[0]!.opened!.book
  const book = () => store.state.getState().books[id] as BookOf<"@matomezu/markdown:markdown">
  return { store, id, book }
}

test("マークダウンのページを開いたステージには紙を置かない（ページは紙を持つ）", () => {
  const { store, book } = markdownStore()
  const page = book().pages[0]!
  expect(page.paper).toBe("@matomezu/base:a4")
  expect(store.state.getState().workspace.stages[0]!.opened).toMatchObject({ page: page.id, paper: null })
})

test("どのページもいつも下へ増やす可変ページ。page-add・page-update で grows を付けるのは断る（false は何も変えない）", () => {
  const { store, id, book } = markdownStore()
  const { perform } = store.actions
  const page = book().pages[0]!
  expect(page.grows).toBeUndefined()
  expect(growOf(store.catalog.core, book(), page)).toEqual({ up: false, down: true, left: false, right: false })
  expect(perform("@matomezu/base:page-add", { title: "2", grows: true }, { book: id }).ok).toBe(false)
  expect(perform("@matomezu/base:page-update", { page: page.id, grows: "down" }, { book: id }).ok).toBe(false)
  expect(perform("@matomezu/base:page-add", { title: "2", grows: false }, { book: id }).ok).toBe(true)
})

test("原文はページのフィールド text（無ければ空の文書）。page-update で丸ごと替える", () => {
  const { store, id, book } = markdownStore()
  const page = book().pages[0]!
  expect("text" in page).toBe(false)
  const done = store.actions.perform(
    "@matomezu/base:page-update",
    { page: page.id, fields: { text: "# 見出し" } },
    { book: id },
  )
  expect(done.ok).toBe(true)
  expect(book().pages[0]!.text).toBe("# 見出し")
})

test("page-update の find・replace は、原文にちょうど 1 か所ある find を替える", () => {
  const { store, id, book } = markdownStore()
  const page = book().pages[0]!.id
  const update = (fields: Record<string, unknown>) =>
    store.actions.perform("@matomezu/base:page-update", { page, fields }, { book: id })
  expect(update({ text: "# 見出し\n本文" }).ok).toBe(true)
  expect(update({ find: "本文", replace: "直した本文" }).ok).toBe(true)
  expect(book().pages[0]!.text).toBe("# 見出し\n直した本文")
})

test("find が無い・2 か所以上（重なりも数える）・text と一緒なら断る", () => {
  const { store, id, book } = markdownStore()
  const page = book().pages[0]!.id
  const update = (fields: Record<string, unknown>) =>
    store.actions.perform("@matomezu/base:page-update", { page, fields }, { book: id })
  expect(update({ find: "a", replace: "b" }).ok).toBe(false) // 原文が無いページ
  expect(update({ text: "aaa" }).ok).toBe(true)
  expect(update({ find: "x", replace: "b" }).ok).toBe(false)
  expect(update({ find: "aa", replace: "b" }).ok).toBe(false)
  expect(update({ text: "aab", find: "b", replace: "c" }).ok).toBe(false)
  expect(book().pages[0]!.text).toBe("aaa")
})

test("ペインの並べ方: 何も無ければ左右に並べる。形に合わなければ左右", () => {
  expect(paneLayoutOf(undefined)).toEqual({ split: "row" })
  expect(paneLayoutOf({ split: "column" })).toEqual({ split: "column" })
  expect(paneLayoutOf({ split: null, shown: "rendered" })).toEqual({ split: null, shown: "rendered" })
  expect(paneLayoutOf({ split: "diagonal" })).toEqual({ split: "row" })
})

const LAYOUT_COMMANDS = [
  "@matomezu/markdown:pane-show-source",
  "@matomezu/markdown:pane-split-row",
  "@matomezu/markdown:pane-split-column",
  "@matomezu/markdown:pane-show-rendered",
] as const

test("並べ方の 4 つのコマンドは、押すとその並べ方にし、今の並べ方のコマンドだけが押した状態。並べ方はそのステージだけに効く", () => {
  const { store } = markdownStore()
  const { state, actions } = store
  const active = (stage: string) => LAYOUT_COMMANDS.filter(c => isActive(store, state.getState(), stage, c))
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-split-row"])
  actions.command("s1", "@matomezu/markdown:pane-show-source")
  expect(state.getState().stageStates.s1?.["@matomezu/markdown"]).toEqual({ split: null, shown: "source" })
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-show-source"])
  actions.command("s1", "@matomezu/markdown:pane-show-rendered")
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-show-rendered"])
  actions.command("s1", "@matomezu/markdown:pane-split-column")
  expect(paneLayoutOf(state.getState().stageStates.s1?.["@matomezu/markdown"])).toEqual({ split: "column" })
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-split-column"])
})

test("ページの設定の項目を持たないタイプでも、ページの設定のコマンドを出し、base のページの設定のダイアログを開く（名前・紙・削除を変えられる）", () => {
  const { store, book } = markdownStore()
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/base:page-settings")).toBe(true)
  expect(store.actions.command("s1", "@matomezu/base:page-settings")).toBe(true)
  expect(store.state.getState().dialog).toMatchObject({
    id: "@matomezu/base:page-settings",
    args: { page: book().pages[0]!.id },
  })
})

test("ほかのタイプのブックでは、ペインの並べ方のコマンドを出さない", () => {
  const store = newStore()
  expect(LAYOUT_COMMANDS.filter(c => isShown(store, store.state.getState(), "s1", c))).toEqual([])
})

test("ページを切り替えても、紙を変えても、ステージに紙を置かない。紙で決まる倍率・道具のアイコンのコマンドは出さない", () => {
  const { store, id, book } = markdownStore()
  const { state, actions } = store
  addPageIn(store, "s1", { title: "ページ 2" })
  const [first, second] = book().pages.map(p => p.id) as [string, string]
  expect(state.getState().workspace.stages[0]!.opened?.page).toBe(second)
  actions.openPage("s1", first)
  expect(state.getState().workspace.stages[0]!.opened).toMatchObject({ page: first, paper: null })
  actions.perform("@matomezu/base:page-update", { page: first, paper: "@matomezu/base:a3" }, { book: id })
  expect(state.getState().workspace.stages[0]!.opened).toMatchObject({ page: first, paper: null })
  for (const c of ["@matomezu/base:zoom-in", "@matomezu/base:tool-picker"] as const)
    expect(isShown(store, state.getState(), "s1", c)).toBe(false)
})

test("ソースのペインで書いた所は、ホストで AI の変更のあとに行い直しても、重ならなければ残り、重なって 1 か所にならなければ落ちる", () => {
  const done: Done[] = []
  const { store, id, book } = markdownStore({ observe: d => done.push(d) })
  const page = book().pages[0]!.id
  const write = (from: string, to: string) => {
    const edit = sourceEdit(from, to, from)
    if (edit.kind !== "send") throw new Error(edit.kind)
    return store.actions.perform("@matomezu/base:page-update", { page, fields: edit.fields }, { book: id })
  }
  store.actions.perform("@matomezu/base:page-update", { page, fields: { text: "# T\n\nfoo\n" } }, { book: id })
  const confirmed = (text: string) => ({ ...book(), pages: [{ ...book().pages[0]!, text }] })
  // AI が先頭に行を足したホストのブックに、foo の後ろへ書いた物を行い直す
  write("# T\n\nfoo\n", "# T\n\nfoo bar\n")
  store.receive({ books: [confirmed("AI\n# T\n\nfoo\n")], settings: {} }, [done.at(-1)!])
  expect(book().pages[0]!.text).toBe("AI\n# T\n\nfoo bar\n")
  // AI が foo を消したなら、書いた物は行えずに落ちる
  write("AI\n# T\n\nfoo bar\n", "AI\n# T\n\nfoo bar!\n")
  store.receive({ books: [confirmed("AI\n# T\n\n")], settings: {} }, [done.at(-1)!])
  expect(book().pages[0]!.text).toBe("AI\n# T\n\n")
})
