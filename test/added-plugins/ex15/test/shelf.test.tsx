// ex15 のたな: フォルダの直下のエントリを並べる。AI の書庫の変更は、たなが見せているフォルダの物なら見えたとして書庫の履歴に入り、
// たたんでいる間（描いたまま隠している間）は入らない。システムフォルダ（たなのフォルダ）は、base の system-folder-add が書庫ホームの先頭に足す
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, WindowRoot } from "matomezu/testing"
import EX15_UI from "../ui"

afterEach(cleanup)

const settled = () => Promise.resolve()
const make = () =>
  createMatomezu({
    plugins: [...BUILTIN_UI, EX15_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
type M = ReturnType<typeof make>
const rowsOf = (m: M) => {
  const { pages, folders } = m.state.getState()
  return { pages: Object.values(pages), folders: Object.values(folders), settings: {} }
}
const libraryUndo = (m: M) => m.state.getState().history.library?.undo ?? []

// この窓 here と、AI の代わりに行う there。どちらも、書庫ホームにフォルダ「箱」が在る所から始める
async function pair() {
  const here = make()
  const there = make()
  const made = there.actions.perform("@matomezu/base:folder-create", { title: "箱" })
  await settled()
  const box = (made as { result: { folder: string } }).result.folder
  here.receive(rowsOf(there), [])
  // AI が箱の名前を変えたと、この窓に知らせる
  const renameByAI = async (title: string, act: string) => {
    const before = there.state.getState().folders[box]
    there.actions.perform("@matomezu/base:entry-rename", { entry: box, title })
    await settled()
    const after = there.state.getState().folders[box]
    here.receive(rowsOf(there), [], {
      books: [],
      by: "ai",
      act,
      actions: ["@matomezu/base:entry-rename"],
      library: { pages: {}, folders: { [box]: { before, after } } },
    })
  }
  return { here, box, renameByAI }
}

test("たなのスクリーンは、書庫ホームの直下のエントリを並べ、フォルダの行を押すと中へ入る", async () => {
  const { here } = await pair()
  render(
    <MatomezuProvider instance={here} layout={placeAdded(DEFAULT_LAYOUT, here.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    here.actions.openScreen("ex15:shelf-screen", {})
  })
  const shelf = () => screen.getByRole("heading", { name: "たな" }).closest("section") as HTMLElement
  const names = () => [...shelf().querySelectorAll("li")].map(li => li.textContent)
  expect(names()).toContain("箱")
  fireEvent.click(screen.getByRole("button", { name: "箱" }))
  expect(names()).toEqual([])
})

test("AI の書庫の変更は、たなが見せているフォルダの物なら書庫の履歴に入る。たたんでいる間は入らず、ひらくと入る", async () => {
  const { here, renameByAI } = await pair()
  here.actions.openScreen("ex15:shelf-screen", {})
  const shelf = here.state.getState().window.screens.find(s => s.def === "ex15:shelf-screen")?.id as string
  await renameByAI("AI の箱", "1")
  expect(libraryUndo(here)).toMatchObject([{ by: "ai" }])
  here.setPluginState("ex15:shelf-folded", shelf, true)
  await renameByAI("AI の箱 2", "2")
  expect(libraryUndo(here)).toHaveLength(1)
  here.setPluginState("ex15:shelf-folded", shelf, undefined)
  expect(libraryUndo(here)).toHaveLength(2)
})

test("たなのフォルダは、base の system-folder-add が書庫ホームの先頭（印の順）に足し、名前は利用者の設定の言語で引く", async () => {
  const here = make()
  here.actions.perform("@matomezu/base:settings-set", { values: { "@matomezu/base:lang": "matomezu:ja" } })
  here.actions.perform("@matomezu/base:system-folder-add", {})
  await settled()
  render(
    <MatomezuProvider instance={here} layout={placeAdded(DEFAULT_LAYOUT, here.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    here.actions.openScreen("ex15:shelf-screen", {})
  })
  const shelf = screen.getByRole("heading", { name: "たな" }).closest("section") as HTMLElement
  expect([...shelf.querySelectorAll("li")].slice(0, 2).map(li => li.textContent)).toEqual([
    "ドキュメント",
    "たなのフォルダ",
  ])
})
