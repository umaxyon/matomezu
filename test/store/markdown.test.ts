// マークダウンのブック: 見せ方はステージに紙を置かない、どのページもいつも可変ページで下へ増やす（可変ページにする・やめるは選べない）、
// ペインの並べ方はステージの画面の状態で、ペインの分割のコマンドで変え、画面の場所に入れる（読み直しても戻す）
import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { screenOf } from "../../web/src/core/window"
import { growOf } from "../../web/src/plugins/base"
import { createBookIn } from "../../web/src/plugins/base/book-new/create-book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { paneLayoutOf, shareAt, shownPanes, swapPanes } from "../../web/src/plugins/books/markdown/panes"
import { sourceEdit } from "../../web/src/plugins/books/markdown/source-edit"
import { isActive, isShown } from "../../web/src/store/commands"
import type { DoneAction as Done } from "../../web/src/store/store"
import { newStore } from "../support"

const markdownStore = (options: Parameters<typeof newStore>[0] = {}) => {
  const store = newStore(options)
  createBookIn(store, "s1", { title: "メモ", type: "@matomezu/markdown:markdown" })
  addPageIn(store, "s1", { title: "ページ 1" })
  const id = screenOf(store.state.getState().window).stages[0]!.opened!.book
  const book = () => store.state.getState().books[id] as BookOf<"@matomezu/markdown:markdown">
  return { store, id, book }
}

test("マークダウンのページを開いたステージには紙を置かない（ページは紙を持つ）", () => {
  const { store, book } = markdownStore()
  const page = book().pages[0]!
  expect(page.paper).toBe("@matomezu/base:a4")
  expect(screenOf(store.state.getState().window).stages[0]!.opened).toMatchObject({ page: page.id, paper: null })
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

test("原文の改行はいつも \\n だけ: page-add・page-update の text と find・replace の \\r\\n と \\r を \\n にそろえる", () => {
  const { store, id, book } = markdownStore()
  const perform = (action: string, args: object) => store.actions.perform(action as never, args as never, { book: id })
  expect(perform("@matomezu/base:page-add", { title: "2", fields: { text: "a\r\nb\rc" } }).ok).toBe(true)
  expect(book().pages[1]!.text).toBe("a\nb\nc")
  const page = book().pages[0]!.id
  expect(perform("@matomezu/base:page-update", { page, fields: { text: "x\r\ny" } }).ok).toBe(true)
  expect(book().pages[0]!.text).toBe("x\ny")
  expect(perform("@matomezu/base:page-update", { page, fields: { find: "x\r\ny", replace: "1\r\n2" } }).ok).toBe(true)
  expect(book().pages[0]!.text).toBe("1\n2")
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

const MD = "@matomezu/markdown"

test("ペインの並べ方: 何も無いか形に合わなければ、ソースを左に半分ずつ左右に並べる", () => {
  const even = { mode: "split-row", first: "source", share: 0.5 } as const
  expect(paneLayoutOf(undefined)).toEqual(even)
  expect(paneLayoutOf({ mode: "split-column", first: "rendered", share: 0.3 })).toEqual({
    mode: "split-column",
    first: "rendered",
    share: 0.3,
  })
  expect(paneLayoutOf({ mode: "diagonal", first: "source", share: 0.5 })).toEqual(even)
  expect(paneLayoutOf({ mode: "split-row", first: "source", share: 0.99 })).toEqual(even)
})

test("入れ替えると、並べたときの左（上）のペインが替わる。1 つだけ見せている間はそのペインだけ", () => {
  const layout = paneLayoutOf(undefined)
  expect(shownPanes(layout)).toEqual(["source", "rendered"])
  expect(shownPanes(swapPanes(layout))).toEqual(["rendered", "source"])
  expect(shownPanes({ ...swapPanes(layout), mode: "source-only" })).toEqual(["source"])
})

test("境目の割合は、始めからの長さを並べた長さで割り、下限 0.15 から 0.85 に収める。長さが 0 なら今のまま", () => {
  expect(shareAt(300, 1000, 0.5)).toBe(0.3)
  expect(shareAt(10, 1000, 0.5)).toBe(0.15)
  expect(shareAt(990, 1000, 0.5)).toBe(0.85)
  expect(shareAt(1 / 3, 1, 0.5)).toBe(0.333)
  expect(shareAt(10, 0, 0.4)).toBe(0.4)
})

test("並べ方は画面の場所に入り、場所を当てはめると戻る。場所に無いか形に合わなければ既定に戻す", () => {
  const { store } = markdownStore()
  const { state, actions } = store
  actions.command("s1", "@matomezu/markdown:pane-split-column")
  const placed = store.address()
  expect(placed.stages[0]!.states).toEqual({ [MD]: { mode: "split-column", first: "source", share: 0.5 } })
  actions.command("s1", "@matomezu/markdown:pane-show-source")
  store.locate(placed)
  expect(state.getState().stageStates.s1?.[MD]).toEqual({ mode: "split-column", first: "source", share: 0.5 })
  const at = (states: Record<string, unknown>) => ({ ...placed, stages: [{ ...placed.stages[0]!, states }] })
  store.locate(at({ [MD]: { mode: "diagonal" } }))
  expect(state.getState().stageStates.s1?.[MD]).toBeUndefined()
  actions.command("s1", "@matomezu/markdown:pane-show-source")
  store.locate(at({}))
  expect(state.getState().stageStates.s1?.[MD]).toBeUndefined()
})

test("ステージの数と並べ方が同時に変わる場所を当てはめても、残るステージに並べ方が入り、消えたステージの置き場は無くなる", () => {
  const { store } = markdownStore()
  const { state, actions } = store
  actions.split("s1")
  const right = screenOf(state.getState().window).stages[1]!.id
  store.setStageState(right, MD, { mode: "rendered-only", first: "source", share: 0.4 })
  const two = store.address()
  store.locate({ ...two, stages: [two.stages[1]!], current: 0 })
  expect(screenOf(state.getState().window).stages.map(s => s.id)).toEqual(["s1"])
  expect(state.getState().stageStates.s1?.[MD]).toEqual({ mode: "rendered-only", first: "source", share: 0.4 })
  expect(state.getState().stageStates[right]).toBeUndefined()
})

const LAYOUT_COMMANDS = [
  "@matomezu/markdown:pane-show-source",
  "@matomezu/markdown:pane-split-row",
  "@matomezu/markdown:pane-split-column",
  "@matomezu/markdown:pane-show-rendered",
] as const

test("並べ方の 4 つのコマンドは、押すとその並べ方にし、今の並べ方のコマンドだけが押した状態。入れ替えた順と境目の割合は変えない。並べ方はそのステージだけに効く", () => {
  const { store } = markdownStore()
  const { state, actions } = store
  const active = (stage: string) => LAYOUT_COMMANDS.filter(c => isActive(store, state.getState(), stage, c))
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-split-row"])
  store.setStageState("s1", MD, { mode: "split-row", first: "rendered", share: 0.3 })
  actions.command("s1", "@matomezu/markdown:pane-show-source")
  expect(state.getState().stageStates.s1?.[MD]).toEqual({ mode: "source-only", first: "rendered", share: 0.3 })
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-show-source"])
  actions.command("s1", "@matomezu/markdown:pane-show-rendered")
  expect(active("s1")).toEqual(["@matomezu/markdown:pane-show-rendered"])
  actions.command("s1", "@matomezu/markdown:pane-split-column")
  expect(paneLayoutOf(state.getState().stageStates.s1?.[MD])).toEqual({
    mode: "split-column",
    first: "rendered",
    share: 0.3,
  })
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
  expect(screenOf(state.getState().window).stages[0]!.opened?.page).toBe(second)
  actions.openPage("s1", first)
  expect(screenOf(state.getState().window).stages[0]!.opened).toMatchObject({ page: first, paper: null })
  actions.perform("@matomezu/base:page-update", { page: first, paper: "@matomezu/base:a3" }, { book: id })
  expect(screenOf(state.getState().window).stages[0]!.opened).toMatchObject({ page: first, paper: null })
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
