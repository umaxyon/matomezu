// ツリーのブック（@matomezu/tree）: 自分のダイアログでページを作り（ページ名・伸びる向き・根のキャプション）、根から伸びる木を紙に描く
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { z } from "zod"
import { toolsIn } from "../../web/src/core/tools"
import { addPageIn, createBookIn } from "../../web/src/plugins/base"
import { fieldsArgs } from "../../web/src/plugins/base/page-tabs/page-fields"
import { keepsPan } from "../../web/src/plugins/base/tool-switch/tools"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

function setup() {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    expect(createBookIn(store, "s1", { title: "木", type: "@matomezu/tree:tree" })).toBe(true)
  })
  const id = (store.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const book = () => store.state.getState().books[id] as { pages: Record<string, unknown>[] }
  return { store, id, book }
}

test("ページを作るボタンでツリーのダイアログが開き、ページ名・伸びる向き・根のキャプションで作ると、根が紙に描かれる。ツールボックスに置けるアイテムは無い", () => {
  const { book } = setup()
  expect(screen.queryByRole("button", { name: "箱" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "ページを作る" }))
  const dialog = screen.getByRole("dialog", { name: "新しいページ" })
  fireEvent.change(within(dialog).getByLabelText("ページ名"), { target: { value: "組織" } })
  fireEvent.click(within(dialog).getByRole("radio", { name: "右へ" }))
  fireEvent.change(within(dialog).getByLabelText("根のキャプション"), { target: { value: "社長" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作る" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(book().pages).toHaveLength(1)
  expect(book().pages[0]).toMatchObject({
    title: "組織",
    settings: { "@matomezu/tree:grow": "right" },
    root: { caption: "社長" },
  })
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["組織"])
  const paper = screen.getByRole("img", { name: "紙" })
  const root = paper.querySelector('[data-root="true"]') as HTMLElement
  expect(root.textContent).toBe("社長")
  expect(Number.parseFloat(root.style.left)).toBe(24) // 右へ伸びる木の根は、紙の左辺の中央
})

test("新しいページの伸びる向きは「ブック継承」から始まり、そのままならページに書かない（あとでブックの向きを変えると、ページも従う）", () => {
  const { store, id, book } = setup()
  act(() => {
    store.actions.perform("@matomezu/base:book-update", { settings: { "@matomezu/tree:grow": "right" } }, { book: id })
  })
  fireEvent.click(screen.getByRole("button", { name: "ページを作る" }))
  const dialog = screen.getByRole("dialog", { name: "新しいページ" })
  const inherit = within(dialog).getByRole("radio", { name: "ブックを継承（右へ）" }) as HTMLInputElement
  expect(inherit.checked).toBe(true)
  fireEvent.change(within(dialog).getByLabelText("根のキャプション"), { target: { value: "社長" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作る" }))
  expect(book().pages[0]).not.toHaveProperty("settings")
  const root = () => screen.getByRole("img", { name: "紙" }).querySelector('[data-root="true"]') as HTMLElement
  expect(Number.parseFloat(root().style.left)).toBe(24) // ブックの右へ
  act(() => {
    store.actions.perform("@matomezu/base:book-update", { settings: { "@matomezu/tree:grow": "down" } }, { book: id })
  })
  expect(Number.parseFloat(root().style.top)).toBe(24) // ブックの下へに従う
})

test("ページとブックの設定のダイアログで伸びる向きを選ぶと、確定の前から並べ直して見せ、キャンセルで元に戻す", () => {
  const { store, id } = setup()
  act(() => {
    expect(addPageIn(store, "s1", { title: "p1", fields: { root: { caption: "根" } } })).toBe(true)
  })
  const page = (store.state.getState().books[id] as { pages: { id: string }[] }).pages[0]!.id
  const top = () =>
    Number.parseFloat(
      (screen.getByRole("img", { name: "紙" }).querySelector('[data-root="true"]') as HTMLElement).style.top,
    )
  expect(top()).toBe(24) // 既定は下へ（根は上辺の中央）
  act(() => store.actions.openDialog("s1", "@matomezu/base:page-settings", { page }))
  let dialog = screen.getByRole("dialog", { name: "ページの設定" })
  fireEvent.click(within(dialog).getByRole("radio", { name: "上へ" }))
  expect(top()).toBeGreaterThan(24) // 上へ（根は下辺の中央）を、確定の前から見せる
  expect(store.state.getState().books[id]).not.toHaveProperty("pages.0.settings")
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  expect(top()).toBe(24)
  act(() => store.actions.openDialog("s1", "@matomezu/base:book-settings"))
  dialog = screen.getByRole("dialog", { name: "ブックの設定" })
  fireEvent.click(
    within(within(dialog).getByRole("group", { name: "伸びる向き" })).getByRole("radio", { name: "上へ" }),
  )
  expect(top()).toBeGreaterThan(24)
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  expect(top()).toBe(24)
})

test("ツリーの道具の組は編集とハンド（初めは編集）。編集の道具の間は紙をずらさない", () => {
  const { store } = setup()
  act(() => {
    expect(addPageIn(store, "s1", { title: "p1", fields: { root: { caption: "根" } } })).toBe(true)
  })
  expect(toolsIn(store.catalog.core, "@matomezu/tree:tree")).toEqual(["@matomezu/tree:edit", "@matomezu/base:hand"])
  expect(keepsPan(store.catalog.core, "@matomezu/tree:edit")).toBe(true)
  expect(keepsPan(store.catalog.core, "@matomezu/base:hand")).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "編集ツール" }))
  expect(screen.getByRole("button", { name: "ハンドツール" })).toBeTruthy()
})

test("根を渡さずにページは作れない（根はツリーのページのフィールド）", () => {
  const { store } = setup()
  act(() => {
    expect(addPageIn(store, "s1", { title: "p1" })).toBe(false)
  })
})

test("子は根から伸びる向きへ描き、親から子へ線を引く。伸びる向きを変えると並べ直す", () => {
  const { store, id } = setup()
  act(() => {
    expect(
      addPageIn(store, "s1", {
        title: "p1",
        fields: {
          root: {
            caption: "根",
            children: [
              { id: "a", caption: "子 A" },
              { id: "b", caption: "子 B" },
            ],
          },
        },
      }),
    ).toBe(true)
  })
  const paper = screen.getByRole("img", { name: "紙" })
  const node = (n: string) => paper.querySelector(`[data-node="${n}"]`) as HTMLElement
  expect(node("a").textContent).toBe("子 A")
  expect(paper.querySelectorAll("line")).toHaveLength(2)
  const top = (n: string) => Number.parseFloat(node(n).style.top)
  expect(top("a")).toBeGreaterThan(top("root")) // 既定は下へ
  const page = (store.state.getState().books[id] as { pages: { id: string }[] }).pages[0]!.id
  act(() => {
    store.actions.perform(
      "@matomezu/base:page-update",
      { page, settings: { "@matomezu/tree:grow": "up" } },
      { book: id },
    )
  })
  expect(top("a")).toBeLessThan(top("root"))
})

test("AI に見せる page-add の fields には、ツリーの根の形（入れ子の子）が入る", () => {
  const { store } = setup()
  const schema = JSON.stringify(z.toJSONSchema(fieldsArgs(store.catalog.core), { io: "input" }))
  expect(schema).toContain("page fields of @matomezu/tree:tree books")
  expect(schema).toContain("children")
})
