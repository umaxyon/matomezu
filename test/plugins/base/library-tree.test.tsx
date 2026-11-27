// 書庫の画面のツリー: 描いた行の並びが、キーの矢印が使う並び（outline.ts の treeRowsOf）と同じ

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { withSystemFolders } from "../../../web/src/core/entries"
import { HOME_ID } from "../../../web/src/core/folders"
import { treeRowsOf } from "../../../web/src/plugins/base/library/outline"
import { LIBRARY_TREE_WIDTH, LIBRARY_UNFOLDED } from "../../../web/src/plugins/base/library/state"
import { DEFAULT_TREE_WIDTH } from "../../../web/src/plugins/base/library/tree-width"
import { NO_DESKS } from "../../../web/src/plugins/base/library/workdesk-rows"
import { pluginValueOf, WINDOW_PLACE } from "../../../web/src/store/plugin-state"
import { SAMPLE_BOOKS } from "../../sample-books"
import { sequence } from "../../support"
import { renderScreen } from "../../ui/support"

afterEach(cleanup)

test("ツリーに描いた行の並びは、treeRowsOf の並びと同じ（フォルダ・ブック・バインダの中を出しても）", () => {
  const store = renderScreen({ books: SAMPLE_BOOKS })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const folder = (title: string, into: string = HOME_ID) =>
    (perform("@matomezu/base:folder-create", { title, into }).result as { folder: string }).folder
  act(() => {
    const a = folder("外")
    folder("中", a)
  })
  fireEvent.click(screen.getAllByRole("button", { name: "書庫", hidden: true })[0] as HTMLElement)
  const tree = within(screen.getByRole("navigation", { name: "フォルダ", hidden: true }))
  // 閉じている行を、出なくなるまで順に開く（書庫ホームは開いている）
  for (;;) {
    const closed = tree.queryAllByRole("button", { name: /の中を出す$/, hidden: true })[0]
    if (!closed) break
    fireEvent.click(closed)
  }
  const s = store.state.getState()
  const center = s.window.screens.find(x => x.stages === undefined)?.id as string
  const unfolded = pluginValueOf(s.pluginValues, center, LIBRARY_UNFOLDED) ?? []
  expect(unfolded.length).toBeGreaterThan(3)
  const drawn = tree.getAllByRole("button", { hidden: true }).flatMap(b => b.dataset.libraryRow ?? [])
  expect(drawn).toEqual(treeRowsOf(s.folders, unfolded, false, NO_DESKS).map(r => r.id))
})

test("ツリーの幅は窓のプラグイン状態の値で、境目のダブルクリックで値を消して既定の幅に戻す", () => {
  const store = renderScreen({ books: SAMPLE_BOOKS })
  fireEvent.click(screen.getAllByRole("button", { name: "書庫", hidden: true })[0] as HTMLElement)
  // ツリー（nav）の親が左の列、その親が書庫の画面
  const library = () =>
    screen.getByRole("navigation", { name: "フォルダ", hidden: true }).parentElement?.parentElement as HTMLElement
  expect(library().style.getPropertyValue("--library-tree-width")).toBe(`${DEFAULT_TREE_WIDTH}px`)
  act(() => store.setPluginState(LIBRARY_TREE_WIDTH.id, WINDOW_PLACE, 400))
  expect(library().style.getPropertyValue("--library-tree-width")).toBe("400px")
  fireEvent.doubleClick(library().querySelector("[data-tree-splitter]") as HTMLElement)
  expect(pluginValueOf(store.state.getState().pluginValues, WINDOW_PLACE, LIBRARY_TREE_WIDTH)).toBeUndefined()
  expect(library().style.getPropertyValue("--library-tree-width")).toBe(`${DEFAULT_TREE_WIDTH}px`)
})

test("書庫ではシステムフォルダごとのアイコンを出し、ツリーを開いても同じ絵を使う", () => {
  const store = renderScreen({ books: SAMPLE_BOOKS })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  act(() => {
    expect(perform("@matomezu/base:folder-create", { title: "普通のフォルダ", into: HOME_ID }).ok).toBe(true)
    const state = store.state.getState()
    const filled = withSystemFolders(state, store.catalog.core, sequence("system-folder"))
    if (!filled) throw new Error("no system folders")
    store.receive(
      {
        pages: Object.values(filled.next.pages),
        folders: Object.values(filled.next.folders),
        settings: { ...state.settings, "@matomezu/base:lang": "matomezu:ja" },
      },
      [],
    )
  })
  fireEvent.click(screen.getAllByRole("button", { name: "書庫", hidden: true })[0] as HTMLElement)
  const tree = within(screen.getByRole("navigation", { name: "フォルダ", hidden: true }))
  const icon = (name: string) => tree.getByRole("button", { name, hidden: true }).querySelector("svg")
  expect(icon("普通のフォルダ")?.querySelector('[fill="#D4A13B"]')).toBeTruthy()
  for (const [name, fill] of [
    ["ドキュメント", "#657B98"],
    ["ワークルーム", "#775AA7"],
    ["画像", "#377E68"],
  ] as const) {
    const before = icon(name)
    expect(before?.querySelector(`[fill="${fill}"]`)).toBeTruthy()
    const markup = before?.outerHTML
    fireEvent.click(tree.getByRole("button", { name: `${name} の中を出す`, hidden: true }))
    expect(icon(name)?.outerHTML).toBe(markup)
  }
})
