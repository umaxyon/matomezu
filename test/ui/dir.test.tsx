// ディレクトリ構成図のブック（plugins/books/dir）: ページを作る・行と罫線を描く・▸・▾ で開け閉めする・アクション（足す・パスから・書き換え・消す・移す・並べ替え）・紙に入らなければ断る
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { toolsIn } from "../../web/src/core/tools"
import { createBookIn } from "../../web/src/plugins/base"
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
    expect(createBookIn(store, "s1", { title: "構成", type: "@matomezu/dir:dir" })).toBe(true)
  })
  const id = (store.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const book = () => store.state.getState().books[id] as { pages: Record<string, unknown>[] }
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
