// 書庫の画面のツリー: 描いた行の並びが、キーの矢印が使う並び（outline.ts の treeRowsOf）と同じ
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { treeRowsOf } from "../../web/src/plugins/base/library/outline"
import { LIBRARY_UNFOLDED } from "../../web/src/plugins/base/library/state"
import { pluginValueOf } from "../../web/src/store/plugin-state"
import { SAMPLE_BOOKS } from "../sample-books"
import { renderScreen } from "./support"

afterEach(cleanup)

test("ツリーに描いた行の並びは、treeRowsOf の並びと同じ（フォルダ・ブック・バインダの中を出しても）", () => {
  const store = renderScreen({ books: SAMPLE_BOOKS })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const folder = (title: string, into?: string) =>
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
  expect(drawn).toEqual(treeRowsOf(s.folders, unfolded).map(r => r.id))
})
