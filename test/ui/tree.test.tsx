// ツリーのブック（@matomezu/tree）: 自分のダイアログでページを作り（ページ名・伸びる向き・根のキャプション）、根から伸びる木を紙に描く
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { z } from "zod"
import { toolsIn } from "../../web/src/core/tools"
import { addPageIn, createBookIn } from "../../web/src/plugins/base"
import { fieldsArgs } from "../../web/src/plugins/base/page-tabs/page-fields"
import { keepsPan } from "../../web/src/plugins/base/tool-switch/tools"
import { layoutTree } from "../../web/src/plugins/books/tree/layout"
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

// ページを作る（base の page-add）。結果の fields に、振った子の id が同じ入れ子で返る
function addTree(store: ReturnType<typeof setup>["store"], id: string, root: unknown) {
  let done: ReturnType<typeof store.actions.perform> | undefined
  act(() => {
    done = store.actions.perform("@matomezu/base:page-add", { title: "p1", fields: { root } }, { book: id })
  })
  if (!done?.ok) throw new Error("page-add refused")
  return done.result as {
    page: string
    fields?: { root: { id: string; children: { id: string; children?: { id: string }[] }[] } }
  }
}

test("子は根から伸びる向きへ描き、親から子へ線を引く。伸びる向きを変えると並べ直す", () => {
  const { store, id } = setup()
  const done = addTree(store, id, { caption: "根", children: [{ caption: "子 A" }, { caption: "子 B" }] })
  const [a, b] = done.fields!.root.children.map(c => c.id)
  const paper = screen.getByRole("img", { name: "紙" })
  const node = (n: string) => paper.querySelector(`[data-node="${n}"]`) as HTMLElement
  expect(node(a!).textContent).toBe("子 A")
  expect(node(b!).textContent).toBe("子 B")
  expect(paper.querySelectorAll("line")).toHaveLength(2)
  const top = (n: string) => Number.parseFloat(node(n).style.top)
  expect(top(a!)).toBeGreaterThan(top(done.fields!.root.id)) // 既定は下へ
  const page = (store.state.getState().books[id] as { pages: { id: string }[] }).pages[0]!.id
  act(() => {
    store.actions.perform(
      "@matomezu/base:page-update",
      { page, settings: { "@matomezu/tree:grow": "up" } },
      { book: id },
    )
  })
  expect(top(a!)).toBeLessThan(top(done.fields!.root.id))
})

test("ページを作るとき、根の子は id を書かずに入れ子で渡し、ツリーが全部に重ならない id を振って、結果に同じ入れ子で返す。id を書いた子は断る", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, {
    caption: "根",
    body: "本文",
    children: [{ caption: "子 A", children: [{ caption: "孫" }] }, { caption: "子 B" }],
  })
  const ids = done.fields!.root.children
  const all = [ids[0]!.id, ids[0]!.children![0]!.id, ids[1]!.id]
  expect(new Set(all).size).toBe(3)
  expect(book().pages[0]).toMatchObject({
    id: done.page,
    root: {
      caption: "根",
      body: "本文",
      children: [
        { id: all[0], caption: "子 A", children: [{ id: all[1], caption: "孫" }] },
        { id: all[2], caption: "子 B" },
      ],
    },
  })
  act(() => {
    const given = { caption: "根", children: [{ id: "x", caption: "子" }] }
    expect(
      store.actions.perform("@matomezu/base:page-add", { title: "p2", fields: { root: given } }, { book: id }).ok,
    ).toBe(false)
  })
})

test("ページを直すとき、根は書いたキャプションと本文だけが替わり（本文の null は消す）、子はそのまま残る。子は渡せない", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, { caption: "社長", body: "本文", children: [{ caption: "子 A" }] })
  const update = (root: Record<string, unknown>) =>
    store.actions.perform("@matomezu/base:page-update", { page: done.page, fields: { root } }, { book: id }).ok
  act(() => {
    expect(update({ caption: "代表" })).toBe(true)
  })
  expect(book().pages[0]).toMatchObject({ root: { caption: "代表", body: "本文", children: [{ caption: "子 A" }] } })
  act(() => {
    expect(update({ body: null })).toBe(true)
    expect(update({ children: [] })).toBe(false)
  })
  expect(book().pages[0]).toMatchObject({ root: { caption: "代表", children: [{ caption: "子 A" }] } })
  expect(book().pages[0]).not.toHaveProperty("root.body")
})

test("AI に見せる fields は、作るときは id の無い入れ子の子を含み、直すときは根のキャプションと本文だけ", () => {
  const { store } = setup()
  const add = JSON.stringify(z.toJSONSchema(fieldsArgs(store.catalog.core, "add"), { io: "input" }))
  expect(add).toContain("page fields of @matomezu/tree:tree books")
  expect(add).toContain("children")
  expect(add).not.toContain('"id"')
  const update = JSON.stringify(z.toJSONSchema(fieldsArgs(store.catalog.core, "update"), { io: "input" }))
  expect(update).toContain("Children do not change here")
  expect(update).not.toContain("children")
})

test("ツリーの受け方は同じ入力なら同じ結果: 同じ id のもとの並びで作ると、同じ id の木になる", () => {
  const make = () => {
    let n = 0
    const store = createMatomezu({
      home: "@matomezu/master:master",
      lang: "ja",
      plugins: BUILTIN_UI,
      newId: () => `id${String(n++).padStart(8, "0")}`,
    })
    let book = ""
    act(() => {
      const made = store.actions.perform("@matomezu/base:book-create", { title: "木", type: "@matomezu/tree:tree" })
      book = (made as { result: { book: string } }).result.book
      store.actions.perform(
        "@matomezu/base:page-add",
        {
          title: "p1",
          fields: { root: { caption: "根", children: [{ caption: "子", children: [{ caption: "孫" }] }] } },
        },
        { book },
      )
    })
    return store.state.getState().books[book]
  }
  const first = make()
  expect(first).toMatchObject({ pages: [{ root: { children: [{ caption: "子", children: [{ caption: "孫" }] }] } }] })
  expect(make()).toEqual(first)
})

test("node-add は親の子に id の無い入れ子で足し、全部にほかと重ならない id を振って同じ入れ子で返す。index で並びの位置を決められる", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, { caption: "根", children: [{ caption: "子 A" }] })
  const root = done.fields!.root
  const run = (args: Record<string, unknown>) =>
    store.actions.perform("@matomezu/tree:node-add", { page: done.page, ...args } as never, { book: id })
  let added: ReturnType<typeof run> | undefined
  act(() => {
    added = run({ parent: root.id, index: 0, nodes: [{ caption: "子 0", children: [{ caption: "孫" }] }] })
  })
  expect(added?.ok).toBe(true)
  const given = (added as { result: { nodes: { id: string; children: { id: string }[] }[] } }).result.nodes
  const ids = [root.id, root.children[0]!.id, given[0]!.id, given[0]!.children[0]!.id]
  expect(new Set(ids).size).toBe(4)
  expect(book().pages[0]).toMatchObject({
    root: {
      children: [
        { id: given[0]!.id, caption: "子 0", children: [{ id: given[0]!.children[0]!.id, caption: "孫" }] },
        { caption: "子 A" },
      ],
    },
  })
  act(() => {
    expect(run({ parent: "x", nodes: [{ caption: "?" }] }).ok).toBe(false)
    expect(run({ parent: root.id, index: 9, nodes: [{ caption: "?" }] }).ok).toBe(false)
    expect(run({ parent: root.id, nodes: [{ id: "x", caption: "?" }] }).ok).toBe(false)
  })
})

test("node-update は子のキャプションを替え（根は断る）、node-remove は子孫ごと消す。根は消せない", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, { caption: "根", children: [{ caption: "子 A", children: [{ caption: "孫" }] }] })
  const root = done.fields!.root
  const a = root.children[0]!.id
  const perform = (action: "@matomezu/tree:node-update" | "@matomezu/tree:node-remove", args: object) =>
    store.actions.perform(action, { page: done.page, ...args } as never, { book: id }).ok
  act(() => {
    expect(perform("@matomezu/tree:node-update", { node: a, caption: "子 A'" })).toBe(true)
    expect(perform("@matomezu/tree:node-update", { node: root.id, caption: "代表" })).toBe(false)
  })
  expect(book().pages[0]).toMatchObject({ root: { caption: "根", children: [{ caption: "子 A'" }] } })
  act(() => {
    expect(perform("@matomezu/tree:node-remove", { node: root.id })).toBe(false)
    expect(perform("@matomezu/tree:node-remove", { node: a })).toBe(true)
  })
  expect(book().pages[0]).not.toHaveProperty("root.children")
})

test("編集の道具の間は、選んでいる節（初めは根）に印が付く。押した節を選び、上下左右のキーで伸びる向きに沿って動かす。ハンドでは印を出さない", () => {
  const { store, id } = setup()
  const done = addTree(store, id, {
    caption: "根",
    children: [{ caption: "子 A", children: [{ caption: "孫" }] }, { caption: "子 B" }],
  })
  const root = done.fields!.root
  const [a, b] = root.children
  const paper = screen.getByRole("img", { name: "紙" })
  const selected = () => [...paper.querySelectorAll('[data-selected="true"]')].map(e => e.getAttribute("data-node"))
  expect(selected()).toEqual([root.id])
  const press = (key: string) => fireEvent.keyDown(window, { key })
  press("ArrowDown") // 下へ伸びる木: 下で最初の子
  expect(selected()).toEqual([a!.id])
  press("ArrowRight") // 右の兄弟
  expect(selected()).toEqual([b!.id])
  press("ArrowUp") // 親
  expect(selected()).toEqual([root.id])
  fireEvent.pointerDown(paper.querySelector(`[data-node="${a!.children![0]!.id}"]`)!, { button: 0 })
  expect(selected()).toEqual([a!.children![0]!.id])
  fireEvent.click(screen.getByRole("button", { name: "編集ツール" }))
  expect(selected()).toEqual([])
  press("ArrowUp") // ハンドでは動かさない
  fireEvent.click(screen.getByRole("button", { name: "ハンドツール" }))
  expect(selected()).toEqual([a!.children![0]!.id])
})

test("選んでいる節の＋で空の子を足してその場で書き、Enter で確定する。Escape か空のままなら、足した子を消して親を選ぶ", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, { caption: "根" })
  const rootId = done.fields!.root.id
  const paper = () => screen.getByRole("img", { name: "紙" })
  const selected = () => paper().querySelector('[data-selected="true"]')?.getAttribute("data-node")
  // 根は伸びる向き（下）の＋だけ
  expect(
    within(paper())
      .getAllByRole("button")
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(["子を足す"])
  fireEvent.click(within(paper()).getByRole("button", { name: "子を足す" }))
  const input = within(paper()).getByRole("textbox", { name: "キャプション" })
  expect(document.activeElement).toBe(input)
  fireEvent.change(input, { target: { value: "子 A" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(within(paper()).queryByRole("textbox")).toBeNull()
  const a = (book().pages[0] as { root: { children: { id: string; caption: string }[] } }).root.children[0]!
  expect(a.caption).toBe("子 A")
  expect(selected()).toBe(a.id)
  // 子には、子の＋と、前と後ろの兄弟の＋
  expect(
    within(paper())
      .getAllByRole("button")
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(["子を足す", "前に兄弟を足す", "後ろに兄弟を足す"])
  fireEvent.click(within(paper()).getByRole("button", { name: "後ろに兄弟を足す" }))
  fireEvent.keyDown(within(paper()).getByRole("textbox"), { key: "Escape" })
  expect((book().pages[0] as { root: { children: unknown[] } }).root.children).toHaveLength(1)
  expect(selected()).toBe(a.id) // 前の兄弟
  fireEvent.click(within(paper()).getByRole("button", { name: "子を足す" }))
  fireEvent.keyDown(within(paper()).getByRole("textbox"), { key: "Enter" }) // 空のまま確定
  expect(book().pages[0]).toMatchObject({ root: { children: [{ id: a.id, caption: "子 A" }] } })
  expect(book().pages[0]).not.toHaveProperty("root.children.0.children")
  expect(selected()).toBe(a.id) // 親
  expect(rootId).not.toBe(a.id)
})

test("Enter かダブルクリックで、選んでいる節をその場で書き換える。根は根のキャプション、空のまま確定しても元のまま、Escape は取り消し", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, { caption: "根", children: [{ caption: "子 A" }] })
  const a = done.fields!.root.children[0]!.id
  const paper = () => screen.getByRole("img", { name: "紙" })
  fireEvent.keyDown(window, { key: "Enter" }) // 根を書き換え
  let input = within(paper()).getByRole("textbox", { name: "キャプション" }) as HTMLInputElement
  expect(input.value).toBe("根")
  fireEvent.change(input, { target: { value: "代表" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(book().pages[0]).toMatchObject({ root: { caption: "代表" } })
  fireEvent.doubleClick(paper().querySelector(`[data-node="${a}"]`)!)
  input = within(paper()).getByRole("textbox") as HTMLInputElement
  expect(input.value).toBe("子 A")
  fireEvent.change(input, { target: { value: "" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(book().pages[0]).toMatchObject({ root: { children: [{ id: a, caption: "子 A" }] } })
  fireEvent.keyDown(window, { key: "Enter" })
  input = within(paper()).getByRole("textbox") as HTMLInputElement
  fireEvent.change(input, { target: { value: "子 B" } })
  fireEvent.keyDown(input, { key: "Escape" })
  expect(book().pages[0]).toMatchObject({ root: { children: [{ id: a, caption: "子 A" }] } })
  expect(within(paper()).queryByRole("textbox")).toBeNull()
})

test("その場の編集は、同じ道具を選び直しても続き、道具が替わると終わる", () => {
  const { store, id } = setup()
  addTree(store, id, { caption: "根" })
  const editing = () => store.state.getState().workspace.stages[0]!.editing
  fireEvent.keyDown(window, { key: "Enter" })
  expect(editing()).toBe(true)
  act(() => store.actions.setTool("s1", "@matomezu/tree:edit"))
  expect(editing()).toBe(true)
  act(() => store.actions.setTool("s1", "@matomezu/base:hand"))
  expect(editing()).toBe(false)
})

test("Delete（Backspace）と節の右クリックのメニューの「削除」で、選んでいる節を子孫ごと消し、前の兄弟（無ければ親）を選ぶ。根は消せず、書いている間の Backspace は字を消すだけ", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, {
    caption: "根",
    children: [{ caption: "子 A" }, { caption: "子 B", children: [{ caption: "孫" }] }, { caption: "子 C" }],
  })
  const root = done.fields!.root
  const [a, b, c] = root.children.map(n => n.id) as [string, string, string]
  const paper = () => screen.getByRole("img", { name: "紙" })
  const selected = () => paper().querySelector('[data-selected="true"]')?.getAttribute("data-node")
  const kids = () => ((book().pages[0] as { root: { children?: { id: string }[] } }).root.children ?? []).map(n => n.id)
  fireEvent.keyDown(window, { key: "Delete" }) // 根は消せない
  expect(kids()).toEqual([a, b, c])
  fireEvent.pointerDown(paper().querySelector(`[data-node="${b}"]`)!, { button: 0 })
  fireEvent.keyDown(window, { key: "Backspace" })
  expect(kids()).toEqual([a, c])
  expect(selected()).toBe(a) // 前の兄弟
  fireEvent.contextMenu(paper().querySelector(`[data-node="${c}"]`)!)
  const menu = screen.getByRole("menu")
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map(m => m.textContent),
  ).toEqual(["キャプションを書くEnter", "節の色", "節の大きさ", "削除Delete"]) // キーを添える
  fireEvent.click(within(menu).getByRole("menuitem", { name: /^削除/ }))
  expect(kids()).toEqual([a])
  expect(selected()).toBe(a)
  fireEvent.keyDown(window, { key: "Enter" })
  const input = within(paper()).getByRole("textbox")
  fireEvent.keyDown(input, { key: "Backspace" })
  expect(kids()).toEqual([a])
  fireEvent.keyDown(input, { key: "Delete" })
  expect(kids()).toEqual([a])
  fireEvent.keyDown(window, { key: "Delete" }) // その場の編集中は消さない
  expect(kids()).toEqual([a])
  fireEvent.keyDown(input, { key: "Escape" })
  fireEvent.keyDown(window, { key: "Delete" })
  expect(kids()).toEqual([])
  expect(selected()).toBe(root.id) // 親
})

test("中央の木の根には上下左右の 4 つの＋が出て、押した向きへ伸びる子を足す", () => {
  const { store, id, book } = setup()
  act(() => {
    store.actions.perform("@matomezu/base:book-update", { settings: { "@matomezu/tree:grow": "center" } }, { book: id })
  })
  addTree(store, id, { caption: "根" })
  const paper = () => screen.getByRole("img", { name: "紙" })
  expect(
    within(paper())
      .getAllByRole("button")
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(["上に子を足す", "下に子を足す", "左に子を足す", "右に子を足す"])
  fireEvent.click(within(paper()).getByRole("button", { name: "上に子を足す" }))
  const input = within(paper()).getByRole("textbox")
  fireEvent.change(input, { target: { value: "上の子" } })
  fireEvent.keyDown(input, { key: "Enter" })
  const child = (book().pages[0] as { root: { children: { id: string; side?: string }[] } }).root.children[0]!
  expect(child.side).toBe("up")
  const top = (n: string) => Number.parseFloat((paper().querySelector(`[data-node="${n}"]`) as HTMLElement).style.top)
  const rootTop = Number.parseFloat((paper().querySelector('[data-root="true"]') as HTMLElement).style.top)
  expect(top(child.id)).toBeLessThan(rootTop)
})

// A4 横の紙で、grow の向きなら入り、ほかの向きなら入らない子の数（なるべく多く）と、grow の向きで入る一番多い数
const A4 = { w: 1123, h: 794 }
const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, caption: `子 ${i}` }))
const fitsWith = (n: number, grow: "down" | "right") =>
  layoutTree({ id: "r", caption: "根", children: kids(n) }, grow, A4).fits
const MOST_RIGHT = (() => {
  let n = 1
  while (fitsWith(n + 1, "right")) n++
  return n
})()

test("節を足すのが紙に入らなければ、node-add は断る。＋で断られたらトースト「紙に入りません」を出し、空の子は残らない", () => {
  const { store, id, book } = setup()
  act(() => {
    store.actions.perform("@matomezu/base:book-update", { settings: { "@matomezu/tree:grow": "right" } }, { book: id })
  })
  const done = addTree(store, id, { caption: "根", children: kids(MOST_RIGHT).map(k => ({ caption: k.caption })) })
  const root = done.fields!.root
  const count = () => (book().pages[0] as { root: { children: unknown[] } }).root.children.length
  act(() => {
    expect(
      store.actions.perform(
        "@matomezu/tree:node-add",
        { page: done.page, parent: root.id, nodes: [{ caption: "もう 1 つ" }] },
        { book: id },
      ).ok,
    ).toBe(false)
  })
  const paper = screen.getByRole("img", { name: "紙" })
  fireEvent.click(within(paper).getByRole("button", { name: "子を足す" }))
  expect(screen.getByRole("alert").textContent).toContain("紙に入りません")
  expect(count()).toBe(MOST_RIGHT)
  expect(within(paper).queryByRole("textbox")).toBeNull()
})

test("向きを変えると紙に入らなくなるなら、ページとブックの設定の変更は断る。設定のダイアログは、確定の前から入らないページの名前と知らせを出し、確定できない", () => {
  const { store, id, book } = setup()
  act(() => {
    store.actions.perform("@matomezu/base:book-update", { settings: { "@matomezu/tree:grow": "right" } }, { book: id })
  })
  expect(fitsWith(MOST_RIGHT, "down")).toBe(false) // 右へなら入り、下へなら入らない数
  const done = addTree(store, id, { caption: "根", children: kids(MOST_RIGHT).map(k => ({ caption: k.caption })) })
  act(() => {
    expect(
      store.actions.perform(
        "@matomezu/base:page-update",
        { page: done.page, settings: { "@matomezu/tree:grow": "down" } },
        { book: id },
      ).ok,
    ).toBe(false)
    expect(
      store.actions.perform("@matomezu/base:book-update", { settings: { "@matomezu/tree:grow": "down" } }, { book: id })
        .ok,
    ).toBe(false)
  })
  expect(book()).toMatchObject({ settings: { "@matomezu/tree:grow": "right" } })
  act(() => store.actions.openDialog("s1", "@matomezu/base:book-settings"))
  const dialog = screen.getByRole("dialog", { name: "ブックの設定" })
  fireEvent.click(
    within(within(dialog).getByRole("group", { name: "伸びる向き" })).getByRole("radio", { name: "下へ" }),
  )
  expect(within(dialog).getByRole("alert").textContent).toBe("p1：紙に入りません")
  expect((within(dialog).getByRole("button", { name: "確定" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(
    within(within(dialog).getByRole("group", { name: "伸びる向き" })).getByRole("radio", { name: "上へ" }),
  )
  expect(within(dialog).getByRole("alert")).toBeTruthy() // 上へも入らない
  fireEvent.click(
    within(within(dialog).getByRole("group", { name: "伸びる向き" })).getByRole("radio", { name: "左へ" }),
  )
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect((within(dialog).getByRole("button", { name: "確定" }) as HTMLButtonElement).disabled).toBe(false)
})

test("節の大きさ: ページの設定で選び方を変えると並べ直し、節のメニューの「節の大きさ」でその節だけ選べる（根には出さない）", () => {
  const { store, id, book } = setup()
  const long = "とても長いキャプションでこの節の幅を広げてしまう文"
  const done = addTree(store, id, { caption: "根", children: [{ caption: long }] })
  const a = done.fields!.root.children[0]!.id
  const paper = () => screen.getByRole("img", { name: "紙" })
  const node = () => paper().querySelector(`[data-node="${a}"]`) as HTMLElement
  expect(node().textContent!.endsWith("…")).toBe(true) // 既定は 20 字で固定
  act(() => {
    store.actions.perform(
      "@matomezu/base:page-update",
      { page: done.page, settings: { "@matomezu/tree:node-size": "wrap-10" } },
      { book: id },
    )
  })
  expect(node().textContent).toContain("\n")
  fireEvent.contextMenu(paper().querySelector('[data-root="true"]')!)
  expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: /^節の大きさ/ })).toBeNull()
  fireEvent.keyDown(window, { key: "Escape" })
  fireEvent.contextMenu(node())
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^節の大きさ/ }))
  const dialog = screen.getByRole("dialog", { name: "節の大きさ" })
  const select = within(dialog).getByRole("combobox", { name: "節の大きさ" }) as HTMLSelectElement
  expect(select.value).toBe("") // 継承
  expect(select.options[0]!.textContent).toBe("ページを継承（10 字で折り返す）")
  fireEvent.change(select, { target: { value: "grow" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "確定" }))
  expect(book().pages[0]).toMatchObject({ root: { children: [{ id: a, size: "grow" }] } })
  expect(node().textContent).toBe(long)
})

test("節の色: 節のメニューの「節の色」で子も根も色を選べ、選んだ色で塗る。足した子は親の色を写す", () => {
  const { store, id, book } = setup()
  const done = addTree(store, id, { caption: "根", children: [{ caption: "子 A" }] })
  const root = done.fields!.root
  const a = root.children[0]!.id
  const paper = () => screen.getByRole("img", { name: "紙" })
  const nodeEl = (n: string) => paper().querySelector(`[data-node="${n}"]`) as HTMLElement
  const pick = (n: string, color: string) => {
    fireEvent.contextMenu(nodeEl(n))
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^節の色/ }))
    const dialog = screen.getByRole("dialog", { name: "節の色" })
    fireEvent.click(within(dialog).getByRole("button", { name: "色" }))
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: color } })
    fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Enter" })
    fireEvent.click(within(dialog).getByRole("button", { name: "確定" }))
  }
  pick(a, "#ff0000")
  expect(book().pages[0]).toMatchObject({ root: { children: [{ id: a, color: "#ff0000" }] } })
  expect(nodeEl(a).style.getPropertyValue("--tree-node-fill")).toBe("#ff0000")
  pick(root.id, "#00ff00")
  expect(book().pages[0]).toMatchObject({ root: { color: "#00ff00" } })
  // 子 A を選んで、子を足す（親の色を写す）
  fireEvent.pointerDown(nodeEl(a), { button: 0 })
  fireEvent.click(within(paper()).getByRole("button", { name: "子を足す" }))
  const input = within(paper()).getByRole("textbox")
  fireEvent.change(input, { target: { value: "孫" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(book().pages[0]).toMatchObject({
    root: { children: [{ id: a, children: [{ caption: "孫", color: "#ff0000" }] }] },
  })
})
