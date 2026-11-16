// フォルダ（スライド）の設定: ページタブのフォルダの右クリックのメニュー、フォルダの設定のダイアログ（紙と向きは中のページ全部に 1 回で付く）、
// フッタメニューの歯車（開いている物の設定）、紙をそろえるタイプのページの設定に紙と向きを出さない
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { pagesIn } from "../../web/src/core/book"
import { drawingPage, SLIDE, testBook, testFolder, testPage } from "../lineup"
import { renderScreen } from "./support"

afterEach(cleanup)

const slide = (id: string, title: string) =>
  testPage(SLIDE, id, { title, paper: "@matomezu/base:ratio-16x9", orientation: "landscape" })

// スライドのフォルダ（2 枚）と図面のページを並べたブックを開く
function open() {
  const pages = [slide("s-a", "一枚目"), slide("s-b", "二枚目")]
  const store = renderScreen({
    books: [testBook("b1", "ブック", [testFolder("f1", "提案", SLIDE, ...pages), drawingPage("d1", { title: "図" })])],
  })
  act(() => store.actions.openBook("s1", "b1"))
  const book = () => store.state.getState().books.b1!
  return { store, book }
}

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(name) })

test("フォルダのタブの右クリックで、設定…・複製・削除… が出る", () => {
  open()
  fireEvent.contextMenu(tab("提案"))
  const menu = screen.getByRole("menu")
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map(m => m.textContent),
  ).toEqual(["設定…", "複製", "削除…"])
})

test("フォルダの設定で紙を変えると、中のページ全部の紙が変わり、元に戻す 1 回で戻る", async () => {
  const { store, book } = open()
  fireEvent.contextMenu(tab("提案"))
  fireEvent.click(screen.getByRole("menuitem", { name: "設定…" }))
  const dialog = screen.getByRole("dialog", { name: "スライドの設定" })
  fireEvent.change(within(dialog).getByLabelText("紙のサイズ"), { target: { value: "@matomezu/base:a4" } })
  const undos = store.state.getState().history.b1?.undo.length ?? 0
  fireEvent.click(within(dialog).getByRole("button", { name: "確定" }))
  expect(dialog.isConnected).toBe(false)
  expect(pagesIn(book(), "f1").map(p => p.paper)).toEqual(["@matomezu/base:a4", "@matomezu/base:a4"])
  await act(() => Promise.resolve()) // 画面の履歴の段は、処理が終わってから入る
  expect(store.state.getState().history.b1?.undo.length).toBe(undos + 1)
  fireEvent.click(screen.getByRole("button", { name: "元に戻す", hidden: true }))
  expect(pagesIn(book(), "f1").map(p => p.paper)).toEqual(["@matomezu/base:ratio-16x9", "@matomezu/base:ratio-16x9"])
})

test("フォルダのタブの右クリックの複製で、写しのフォルダが隣にでき、その写しが開く", () => {
  const { book } = open()
  fireEvent.contextMenu(tab("提案"))
  fireEvent.click(screen.getByRole("menuitem", { name: "複製" }))
  expect(book().lineup.map(e => e.title)).toEqual(["提案", "提案 2", "図"])
  const copy = book().lineup[1]!
  expect(pagesIn(book(), copy.id).map(p => p.title)).toEqual(["一枚目", "二枚目"])
  expect(tab("提案 2").getAttribute("aria-selected")).toBe("true")
})

test("空のフォルダの設定では、紙のサイズと向きを押せない", () => {
  const store = renderScreen({ books: [testBook("b1", "ブック", [testFolder("f1", "提案", SLIDE)])] })
  act(() => store.actions.openBook("s1", "b1"))
  fireEvent.contextMenu(tab("提案"))
  fireEvent.click(screen.getByRole("menuitem", { name: "設定…" }))
  const dialog = screen.getByRole("dialog", { name: "スライドの設定" })
  expect((within(dialog).getByLabelText("紙のサイズ") as HTMLSelectElement).disabled).toBe(true)
  expect((within(dialog).getByLabelText("向き") as HTMLSelectElement).disabled).toBe(true)
})

test("フッタメニューの歯車は、スライドを開いていればスライドの設定、図面のページならページの設定を開く", () => {
  open()
  fireEvent.click(tab("提案"))
  fireEvent.click(screen.getByRole("button", { name: "設定", hidden: true }))
  expect(screen.getByRole("dialog", { name: "スライドの設定" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))
  fireEvent.click(tab("図"))
  expect(screen.queryByRole("button", { name: "設定", hidden: true })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "ページの設定", hidden: true }))
  expect(screen.getByRole("dialog", { name: "ページの設定" })).toBeTruthy()
})

test("スライドのページの設定には、紙のサイズと向きが出ない", () => {
  const { store } = open()
  act(() => store.actions.openDialog("s1", "@matomezu/base:page-settings", { page: "s-a" }))
  const dialog = screen.getByRole("dialog", { name: "ページの設定" })
  expect(within(dialog).queryByLabelText("紙のサイズ")).toBeNull()
  expect(within(dialog).queryByLabelText("向き")).toBeNull()
})
