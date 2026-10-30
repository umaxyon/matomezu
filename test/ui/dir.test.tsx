// ディレクトリ構成図のブック（plugins/books/dir）: ページを作る・行と罫線を描く・▸・▾ で開け閉めする・アクション（足す・パスから・書き換え・消す・移す・並べ替え）・紙に入らなければ断る
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { toolsIn } from "../../web/src/core/tools"
import { createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { writeRich } from "./rich-input"

afterEach(cleanup)

function setup() {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    expect(createBookIn(store, "s1", { title: "構成", type: "@matomezu/dir:dir" })).toBe(true)
  })
  const id = (store.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const book = () => store.state.getState().books[id] as { pages: readonly Record<string, unknown>[] }
  const perform = (action: string, args: unknown) => {
    let done: ReturnType<typeof store.actions.perform> | undefined
    act(() => {
      done = store.actions.perform(action as never, args as never, { book: id })
    })
    return done!
  }
  return { store, id, book, perform }
}

// 根 proj（src（a.ts）と README.md）のページを作り、その id と振った id を返す
function addProject(perform: ReturnType<typeof setup>["perform"]) {
  const done = perform("@matomezu/base:page-add", {
    title: "p1",
    fields: {
      root: {
        name: "proj",
        children: [
          { kind: "folder", name: "src", children: [{ kind: "file", name: "a.ts" }] },
          { kind: "file", name: "README.md" },
        ],
      },
    },
  })
  if (!done.ok) throw new Error("page-add refused")
  const result = done.result as {
    page: string
    fields: { root: { id: string; children: { id: string; children?: { id: string }[] }[] } }
  }
  const [src, readme] = result.fields.root.children
  return { page: result.page, root: result.fields.root.id, src: src!.id, a: src!.children![0]!.id, readme: readme!.id }
}

const rowNames = () =>
  [...screen.getByRole("img", { name: "紙" }).querySelectorAll("[data-entry]")].map(e => e.textContent)

test("ページを作るボタンでダイアログが開き、根のフォルダの名前は初めはページ名。作ると根の行が紙に描かれる", () => {
  const { book } = setup()
  fireEvent.click(screen.getByRole("button", { name: "ページを作る" }))
  const dialog = screen.getByRole("dialog", { name: "新しいページ" })
  fireEvent.change(within(dialog).getByLabelText("ページ名"), { target: { value: "構成図" } })
  expect((within(dialog).getByLabelText("根のフォルダの名前") as HTMLInputElement).value).toBe("構成図")
  fireEvent.change(within(dialog).getByLabelText("根のフォルダの名前"), { target: { value: "proj" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作る" }))
  expect(book().pages[0]).toMatchObject({ title: "構成図", root: { kind: "folder", name: "proj" } })
  expect(rowNames()).toEqual(["proj"])
})

test("道具の組は鉛筆とハンド（初めは鉛筆）", () => {
  const { store } = setup()
  expect(toolsIn(store.catalog.core, "@matomezu/dir:dir")).toEqual(["@matomezu/dir:pencil", "@matomezu/base:hand"])
})

test("行を上から並べ、中身のあるフォルダには ▸・▾ を出す。押すと閉じて中身の行を隠し、データに残す。ハンドでも押せる", () => {
  const { store, book, perform } = setup()
  const ids = addProject(perform)
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "README.md"])
  const paper = screen.getByRole("img", { name: "紙" })
  expect(paper.querySelector(`[data-toggle="${ids.readme}"]`)).toBeNull()
  fireEvent.click(within(paper).getAllByRole("button", { name: "閉じる" })[1]!)
  expect(rowNames()).toEqual(["proj", "src", "README.md"])
  expect(book().pages[0]).toMatchObject({ root: { children: [{ closed: true }, { kind: "file" }] } })
  act(() => store.actions.command("s1", "@matomezu/base:tool-set", "@matomezu/base:hand"))
  fireEvent.click(within(paper).getByRole("button", { name: "開く" }))
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "README.md"])
})

test("編集のロック中は ▸・▾ を押せない", () => {
  const { perform } = setup()
  addProject(perform)
  expect(perform("@matomezu/base:book-lock", {}).ok).toBe(true)
  const toggles = within(screen.getByRole("img", { name: "紙" })).getAllByRole("button", { name: "閉じる" })
  expect(toggles.every(b => (b as HTMLButtonElement).disabled)).toBe(true)
})

test("中身を足す・書き換える（根も）・消す・移す・並べ替える。パスから組み立てると、パスごとに指す id を返す", () => {
  const { perform, book } = setup()
  const ids = addProject(perform)
  const added = perform("@matomezu/dir:entry-add", {
    page: ids.page,
    parent: ids.src,
    index: 0,
    entries: [{ kind: "file", name: "z.ts" }],
  })
  expect(added.ok && (added.result as { entries: { id: string }[] }).entries).toHaveLength(1)
  expect(rowNames()).toEqual(["proj", "src", "z.ts", "a.ts", "README.md"])
  expect(perform("@matomezu/dir:folder-sort", { page: ids.page, folder: ids.src, order: "asc" }).ok).toBe(true)
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "z.ts", "README.md"])
  expect(
    perform("@matomezu/dir:entry-update", { page: ids.page, entry: ids.root, name: "app", color: "danger" }).ok,
  ).toBe(true)
  expect(book().pages[0]).toMatchObject({ root: { name: "app", color: "danger" } })
  expect(perform("@matomezu/dir:entry-move", { page: ids.page, entry: ids.readme, parent: ids.src }).ok).toBe(true)
  expect(rowNames()).toEqual(["app", "src", "a.ts", "z.ts", "README.md"])
  expect(perform("@matomezu/dir:entry-move", { page: ids.page, entry: ids.src, parent: ids.a }).ok).toBe(false)
  expect(perform("@matomezu/dir:entry-remove", { page: ids.page, entry: ids.src }).ok).toBe(true)
  expect(rowNames()).toEqual(["app"])
  expect(perform("@matomezu/dir:entry-remove", { page: ids.page, entry: ids.root }).ok).toBe(false)
  const built = perform("@matomezu/dir:paths-add", { page: ids.page, parent: ids.root, paths: ["web/src/", "go.mod"] })
  expect(built.ok && (built.result as { ids: string[] }).ids).toHaveLength(2)
  expect(rowNames()).toEqual(["app", "web", "src", "go.mod"])
})

test("行が紙に入らなくなる足し方・開き方は断る（閉じたフォルダの中身は数えない）", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  const many = Array.from({ length: 60 }, (_, i) => ({ kind: "file" as const, name: `f${i}` }))
  expect(perform("@matomezu/dir:entry-add", { page: ids.page, parent: ids.src, entries: many }).ok).toBe(false)
  expect(perform("@matomezu/dir:folder-close", { page: ids.page, folder: ids.src, closed: true }).ok).toBe(true)
  expect(perform("@matomezu/dir:entry-add", { page: ids.page, parent: ids.src, entries: many }).ok).toBe(true)
  expect(perform("@matomezu/dir:folder-close", { page: ids.page, folder: ids.src, closed: false }).ok).toBe(false)
})

const paper = () => screen.getByRole("img", { name: "紙" })
const selectedRow = () => paper().querySelector('[data-selected="true"]')?.getAttribute("data-entry")
const row = (id: string) => paper().querySelector(`[data-entry="${id}"]`) as HTMLElement
const press = (key: string) => fireEvent.keyDown(window, { key })

test("鉛筆では初めは根を選び、押した行・↑↓ で選ぶ行を替える。← で開いたフォルダを閉じ（ほかは親のフォルダ）、→ で閉じたフォルダを開き、Home で根に戻る。ハンドでは選んだ印を出さない", () => {
  const { store, perform } = setup()
  const ids = addProject(perform)
  expect(selectedRow()).toBe(ids.root)
  press("ArrowDown")
  expect(selectedRow()).toBe(ids.src)
  fireEvent.pointerDown(row(ids.readme), { button: 0 })
  expect(selectedRow()).toBe(ids.readme)
  press("ArrowUp")
  expect(selectedRow()).toBe(ids.a)
  press("ArrowLeft") // ファイルからは親のフォルダ
  expect(selectedRow()).toBe(ids.src)
  press("ArrowLeft") // 開いたフォルダは閉じる
  expect(selectedRow()).toBe(ids.src)
  expect(rowNames()).toEqual(["proj", "src", "README.md"])
  press("ArrowRight") // 閉じたフォルダは開く
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "README.md"])
  press("ArrowRight") // 開いていれば何もしない
  expect(selectedRow()).toBe(ids.src)
  press("ArrowLeft")
  press("ArrowLeft") // 閉じたフォルダからは親
  expect(selectedRow()).toBe(ids.root)
  press("ArrowLeft") // 根も開いていれば閉じる
  expect(rowNames()).toEqual(["proj"])
  press("ArrowLeft") // 閉じた根はそのまま
  expect(selectedRow()).toBe(ids.root)
  press("ArrowRight")
  press("Home")
  expect(selectedRow()).toBe(ids.root)
  act(() => store.actions.command("s1", "@matomezu/base:tool-set", "@matomezu/base:hand"))
  expect(selectedRow()).toBeUndefined()
})

test("Enter・F2・ダブルクリックで名前をその場で書き、Enter で確定、Escape で取り消す（根も）", () => {
  const { book, perform } = setup()
  const ids = addProject(perform)
  press("Enter")
  let input = within(paper()).getByRole("textbox", { name: "名前" })
  writeRich(input, "app")
  fireEvent.keyDown(input, { key: "Enter" })
  expect(book().pages[0]).toMatchObject({ root: { name: "app" } })
  fireEvent.doubleClick(row(ids.a))
  input = within(paper()).getByRole("textbox", { name: "名前" })
  writeRich(input, [
    ["main", true],
    [".ts", false],
  ])
  expect(row(ids.a).textContent).toBe("main.ts") // 書いている字で描き直す
  fireEvent.keyDown(input, { key: "Escape" })
  expect(rowNames()).toEqual(["app", "src", "a.ts", "README.md"])
  press("F2")
  writeRich(within(paper()).getByRole("textbox", { name: "名前" }), "b.ts")
  fireEvent.blur(within(paper()).getByRole("textbox", { name: "名前" }))
  expect(rowNames()).toEqual(["app", "src", "b.ts", "README.md"])
})

test("d と f ですぐ下に兄弟のフォルダとファイルを足して書き始める（根では中の末尾）。空のまま終えると消す", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  fireEvent.pointerDown(row(ids.a), { button: 0 })
  press("d")
  let input = within(paper()).getByRole("textbox", { name: "名前" })
  writeRich(input, "lib")
  fireEvent.keyDown(input, { key: "Enter" })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "lib", "README.md"])
  expect(paper().querySelector(`[data-entry="${selectedRow()}"]`)?.getAttribute("data-kind")).toBe("folder")
  press("Home")
  press("f")
  input = within(paper()).getByRole("textbox", { name: "名前" })
  writeRich(input, "go.mod")
  fireEvent.keyDown(input, { key: "Enter" })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "lib", "README.md", "go.mod"])
  press("f")
  expect(rowNames()).toHaveLength(7)
  fireEvent.keyDown(within(paper()).getByRole("textbox", { name: "名前" }), { key: "Escape" })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "lib", "README.md", "go.mod"])
  expect(row(selectedRow()!).textContent).toBe("go.mod") // すぐ上の行
})

test("＋はフォルダの行なら中の末尾に（閉じていれば開く）、ファイルの行ならすぐ下に足して書き始める", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  perform("@matomezu/dir:folder-close", { page: ids.page, folder: ids.src, closed: true })
  fireEvent.pointerDown(row(ids.src), { button: 0 })
  fireEvent.click(within(paper()).getByRole("button", { name: "ファイルを足す" }))
  writeRich(within(paper()).getByRole("textbox", { name: "名前" }), "z.ts")
  fireEvent.keyDown(within(paper()).getByRole("textbox", { name: "名前" }), { key: "Enter" })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "z.ts", "README.md"])
  fireEvent.pointerDown(row(ids.readme), { button: 0 })
  fireEvent.click(within(paper()).getByRole("button", { name: "フォルダを足す" }))
  writeRich(within(paper()).getByRole("textbox", { name: "名前" }), "docs")
  fireEvent.keyDown(within(paper()).getByRole("textbox", { name: "名前" }), { key: "Enter" })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "z.ts", "README.md", "docs"])
})

test("行の右クリックでその行を選んでメニューを開く。並べ替えはフォルダだけ。削除と Delete で消し（根は消せない）、すぐ上を選ぶ", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  fireEvent.contextMenu(row(ids.src))
  expect(selectedRow()).toBe(ids.src)
  const items = () =>
    within(screen.getByRole("menu"))
      .getAllByRole("menuitem")
      .map(m => m.textContent)
  expect(items()).toEqual(["設定…", "昇順で並べる", "降順で並べる", "削除Delete"])
  fireEvent.keyDown(window, { key: "Escape" })
  fireEvent.contextMenu(row(ids.a))
  expect(items()).not.toContain("昇順で並べる")
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^削除/ }))
  expect(rowNames()).toEqual(["proj", "src", "README.md"])
  expect(selectedRow()).toBe(ids.src)
  press("Home")
  press("Delete")
  expect(rowNames()).toEqual(["proj", "src", "README.md"])
})

test("右クリックの「設定…」で、フォルダもファイルも同じノードの設定のダイアログを開き、名前と説明を替える（空の説明は消す）", () => {
  const { book, perform } = setup()
  const ids = addProject(perform)
  fireEvent.contextMenu(row(ids.readme))
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "設定…" }))
  let dialog = screen.getByRole("dialog", { name: "ノードの設定" })
  writeRich(within(dialog).getByLabelText("名前"), "README.txt")
  writeRich(within(dialog).getByLabelText("説明"), "はじめに読む")
  fireEvent.click(within(dialog).getByRole("button", { name: "確定" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "README.txt"])
  expect(book().pages[0]).toMatchObject({
    root: { children: [{ kind: "folder" }, { name: "README.txt", description: "はじめに読む" }] },
  })
  const note = paper().querySelector(`[data-note="${ids.readme}"]`)
  expect(note?.textContent).toBe("はじめに読む")
  expect(note?.getAttribute("data-selected")).toBe("true") // 選んでいる行の説明にも印
  fireEvent.contextMenu(row(ids.src))
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "設定…" }))
  dialog = screen.getByRole("dialog", { name: "ノードの設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  fireEvent.contextMenu(row(ids.readme))
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "設定…" }))
  writeRich(within(screen.getByRole("dialog")).getByLabelText("説明"), " ")
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "確定" }))
  expect(book().pages[0]).not.toHaveProperty("root.children.1.description")
})

test("フォルダを選んで Tab で、行のすぐ右に種類を選ぶ枠を出す。↑↓ と Enter で選んだ種類を中の末尾に足して書き始め、Escape でやめる。ファイルでは出さない", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  fireEvent.pointerDown(row(ids.src), { button: 0 })
  press("Tab")
  let picker = within(paper()).getByRole("menu", { name: "中に足す" })
  expect(document.activeElement).toBe(within(picker).getByRole("menuitem", { name: "フォルダ" }))
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
  expect(document.activeElement).toBe(within(picker).getByRole("menuitem", { name: "ファイル" }))
  fireEvent.keyDown(document.activeElement!, { key: "Enter" })
  expect(within(paper()).queryByRole("menu")).toBeNull()
  const input = within(paper()).getByRole("textbox", { name: "名前" })
  writeRich(input, "b.ts")
  fireEvent.keyDown(input, { key: "Enter" })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "b.ts", "README.md"])
  expect(paper().querySelectorAll('[data-entry][data-kind="file"]')).toHaveLength(3)
  fireEvent.pointerDown(row(ids.src), { button: 0 })
  press("Tab")
  picker = within(paper()).getByRole("menu", { name: "中に足す" })
  fireEvent.keyDown(document.activeElement!, { key: "Escape" })
  expect(within(paper()).queryByRole("menu")).toBeNull()
  expect(selectedRow()).toBe(ids.src)
  fireEvent.pointerDown(row(ids.readme), { button: 0 })
  press("Tab")
  expect(within(paper()).queryByRole("menu")).toBeNull()
})

test("選んでいる行が、閉じたフォルダの中に隠れたら、見えている中でいちばん近いフォルダを選ぶ", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  fireEvent.pointerDown(row(ids.a), { button: 0 })
  fireEvent.click(within(paper()).getAllByRole("button", { name: "閉じる" })[1]!)
  expect(selectedRow()).toBe(ids.src)
  press("ArrowDown")
  expect(selectedRow()).toBe(ids.readme)
})

test("右クリックの並べ替えで、直下を名前の昇順・降順に並べる（フォルダが先）", () => {
  const { perform } = setup()
  const ids = addProject(perform)
  perform("@matomezu/dir:entry-add", {
    page: ids.page,
    parent: ids.src,
    entries: [
      { kind: "file", name: "ホゲ" },
      { kind: "file", name: "イヌ" },
    ],
  })
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "ホゲ", "イヌ", "README.md"])
  fireEvent.contextMenu(row(ids.src))
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "昇順で並べる" }))
  expect(rowNames()).toEqual(["proj", "src", "a.ts", "イヌ", "ホゲ", "README.md"])
  fireEvent.contextMenu(row(ids.src))
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "降順で並べる" }))
  expect(rowNames()).toEqual(["proj", "src", "ホゲ", "イヌ", "a.ts", "README.md"])
})

test("紙の右クリックの「ページの設定」で、ページ名と削除のほかに、説明の表示と、その下に開く枠の前の「・・・」・左の区切り線を切り替える（確定の前から見せる。表示を切ると枠を閉じる）", () => {
  const { book, perform } = setup()
  const ids = addProject(perform)
  perform("@matomezu/dir:entry-update", { page: ids.page, entry: ids.a, description: "説明" })
  fireEvent.contextMenu(paper())
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "ページの設定" }))
  const dialog = screen.getByRole("dialog", { name: "ページの設定" })
  expect(within(dialog).getByLabelText("ページの名前")).toBeTruthy()
  expect(within(dialog).getByRole("button", { name: "ページを削除" })).toBeTruthy()
  const note = () => paper().querySelector(`[data-note="${ids.a}"]`)?.textContent
  expect(note()).toBe("説明")
  fireEvent.click(within(dialog).getByRole("switch", { name: "説明の前に「・・・」" }))
  expect(note()).toBe("・・・ 説明")
  fireEvent.click(within(dialog).getByRole("switch", { name: "説明の左に区切り線" }))
  expect(paper().querySelector("[data-divider]")).not.toBeNull()
  const panel = () =>
    within(dialog).getByRole("switch", { name: "説明の前に「・・・」", hidden: true }).closest("[data-open]") // 閉じた枠の中も見る
  expect(panel()?.getAttribute("data-open")).toBe("true")
  fireEvent.click(within(dialog).getByRole("switch", { name: "説明を表示" }))
  expect(note()).toBeUndefined()
  expect(paper().querySelector("[data-divider]")).toBeNull()
  expect(panel()?.getAttribute("data-open")).toBe("false")
  fireEvent.click(within(dialog).getByRole("button", { name: "確定" }))
  expect(book().pages[0]).toMatchObject({
    settings: { "@matomezu/dir:notes": { shown: false, dots: true, divider: true } },
  })
})

test("説明を出している間は、説明の列をダブルクリックして説明をその場で書く（説明の無い行も）。Enter で確定、Escape で取り消し、空にすると消す。ハンドと、説明を出さないページでは書けない", () => {
  const { book, perform } = setup()
  const ids = addProject(perform)
  perform("@matomezu/dir:entry-update", { page: ids.page, entry: ids.a, description: "説明" })
  const note = (id: string) => paper().querySelector(`[data-note="${id}"]`)?.textContent
  const cell = (id: string) => paper().querySelector(`[data-note-cell="${id}"]`) as HTMLElement
  const input = () => within(paper()).getByRole("textbox", { name: "説明" })
  fireEvent.doubleClick(cell(ids.readme)) // 説明の無い行
  expect(selectedRow()).toBe(ids.readme)
  writeRich(input(), "はじめに")
  fireEvent.keyDown(input(), { key: "Enter" })
  expect(note(ids.readme)).toBe("はじめに")
  fireEvent.doubleClick(cell(ids.a))
  writeRich(input(), "替えた")
  fireEvent.keyDown(input(), { key: "Escape" })
  expect(note(ids.a)).toBe("説明")
  fireEvent.doubleClick(cell(ids.a))
  writeRich(input(), "")
  fireEvent.blur(input())
  expect(note(ids.a)).toBeUndefined()
  expect(JSON.stringify(book().pages[0])).not.toContain('"説明"') // データからも消す
  perform("@matomezu/base:page-update", {
    page: ids.page,
    settings: { "@matomezu/dir:notes": { shown: false, dots: false, divider: false } },
  })
  expect(cell(ids.a)).toBeNull()
})
