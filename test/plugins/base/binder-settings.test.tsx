// バインダ（スライド）の設定: ページタブのバインダの右クリックのメニュー、バインダの設定のダイアログ（紙と向きは中のページ全部に 1 回で付く）、
// フッタメニューの歯車（開いている物の設定）、紙をそろえるタイプのページの設定に紙と向きを出さない
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { ownTitlesOf, pagesIn } from "../../../web/src/core/book"
import { A4, WIDE } from "../../../web/src/plugins/base/looks/papers"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"
import { renderScreen } from "../../ui/support"

afterEach(cleanup)

const slide = (id: string, title: string) => testPage(SLIDE, id, { title, paper: WIDE.id, orientation: "landscape" })

// スライドのバインダ（2 枚）と図面のページを並べたブックを開く
function open() {
  const pages = [slide("s-a", "一枚目"), slide("s-b", "二枚目")]
  const store = renderScreen({
    books: [testBook("b1", "ブック", [testBinder("f1", "提案", SLIDE, ...pages), drawingPage("d1", { title: "図" })])],
  })
  act(() => store.actions.openBook("s1", "b1"))
  const book = () => store.state.getState().books.b1!
  return { store, book }
}

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(name) })

test("バインダのタブの右クリックで、設定…・複製・削除… が出る", () => {
  open()
  fireEvent.contextMenu(tab("提案"))
  const menu = screen.getByRole("menu")
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map(m => m.textContent),
  ).toEqual(["設定…", "複製", "削除…"])
})

test("バインダの設定で紙を変えると、中のページ全部の紙が変わり、元に戻す 1 回で戻る", async () => {
  const { store, book } = open()
  fireEvent.contextMenu(tab("提案"))
  fireEvent.click(screen.getByRole("menuitem", { name: "設定…" }))
  const dialog = screen.getByRole("dialog", { name: "スライドの設定" })
  fireEvent.change(within(dialog).getByLabelText("紙のサイズ"), { target: { value: A4.id } })
  const undos = store.state.getState().history.b1?.undo.length ?? 0
  fireEvent.click(within(dialog).getByRole("button", { name: "確定" }))
  expect(dialog.isConnected).toBe(false)
  expect(pagesIn(book(), "f1").map(p => p.paper)).toEqual([A4.id, A4.id])
  await act(() => Promise.resolve()) // 画面の履歴の段は、処理が終わってから入る
  expect(store.state.getState().history.b1?.undo.length).toBe(undos + 1)
  fireEvent.click(screen.getByRole("button", { name: "元に戻す", hidden: true }))
  expect(pagesIn(book(), "f1").map(p => p.paper)).toEqual([WIDE.id, WIDE.id])
})

test("バインダのタブの右クリックの複製で、写しのバインダが隣にでき、その写しが開く", () => {
  const { book } = open()
  fireEvent.contextMenu(tab("提案"))
  fireEvent.click(screen.getByRole("menuitem", { name: "複製" }))
  expect(ownTitlesOf(book().lineup)).toEqual(["提案", "提案 2", "図"])
  const copy = book().lineup[1]!
  expect(pagesIn(book(), copy.id).map(p => p.title)).toEqual(["一枚目", "二枚目"])
  expect(tab("提案 2").getAttribute("aria-selected")).toBe("true")
})

test("空のバインダの設定では、紙のサイズと向きを押せない", () => {
  const store = renderScreen({ books: [testBook("b1", "ブック", [testBinder("f1", "提案", SLIDE)])] })
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

test("ページ一覧のスライドの右クリックの「ページの設定」で、そのスライドの設定が開く。紙のサイズと向きは出ない", () => {
  const { store } = open()
  act(() => store.actions.openPage("s1", "s-a"))
  fireEvent.contextMenu(screen.getByRole("button", { name: /二枚目/ }))
  fireEvent.click(screen.getByRole("menuitem", { name: "ページの設定" }))
  const dialog = screen.getByRole("dialog", { name: "ページの設定" })
  expect((within(dialog).getByLabelText("ページの名前") as HTMLInputElement).value).toBe("二枚目")
  expect(within(dialog).queryByLabelText("紙のサイズ")).toBeNull()
  expect(within(dialog).queryByLabelText("向き")).toBeNull()
})
