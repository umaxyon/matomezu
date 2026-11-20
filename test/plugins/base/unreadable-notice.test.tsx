// 読めない物が移った・戻ったときの知らせ: 窓を開いたあと 1 回だけのダイアログ。訳ごとの数は多い順に 3 行まで、残りは「ほか」。
// ［見る］は書庫のスクリーンで読めない物のフォルダを開き、戻っただけなら［閉じる］だけ。閉じたら同じ窓では出さない
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { UNREADABLE_ID } from "../../../web/src/core/folders"
import type { UnreadableNotice } from "../../../web/src/core/unreadable"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { LIBRARY_SCREEN } from "../../../web/src/plugins/base/library/screen"
import { LIBRARY_FOLDER } from "../../../web/src/plugins/base/library/state"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { pluginValueOf } from "../../../web/src/store/plugin-state"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

function open(notice: UnreadableNotice) {
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
    plugins: BUILTIN_UI,
    unreadableNotice: notice,
  })
  const tree = () => (
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>
  )
  const drawn = render(tree())
  return { store, redraw: () => drawn.rerender(<div key="again">{tree()}</div>) }
}

test("移った物は、数と訳ごとの数（多い順に 3 行、残りはほか）と戻った数を出し、［見る］で書庫の読めない物のフォルダを開く。閉じたら描き直しても出ない", () => {
  const { store, redraw } = open({
    moved: [
      { code: "W027", type: "@foo/board:card", count: 2 },
      { code: "W005", count: 1 },
      { code: "W027", type: "@foo/board:lane", count: 2 },
      { code: "W029", count: 3 },
      { code: "W027", type: "@bar/x:y", count: 1 },
    ],
    returned: 2,
  })
  expect(screen.getByText("読めない物が 9 件移りました")).toBeTruthy()
  const lines = [...document.querySelectorAll("dialog[role=alertdialog] p")].map(p => p.textContent)
  expect(lines).toEqual([
    "読めない物が 9 件移りました",
    "プラグインがありません: @foo/board　4 件",
    "決まりに合いません　3 件",
    "形が合いません　1 件",
    "ほか 1 件",
    "読めるようになった物が 2 件戻りました",
  ])
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "見る", hidden: true }))
  })
  const s = store.state.getState()
  const library = s.window.screens.find(x => x.def === LIBRARY_SCREEN.id)?.id as string
  expect(library).toBeDefined()
  expect(pluginValueOf(s.pluginValues, library, LIBRARY_FOLDER)).toBe(UNREADABLE_ID)
  expect(screen.queryByText("読めない物が 9 件移りました")).toBeNull()
  redraw()
  expect(screen.queryByText("読めない物が 9 件移りました")).toBeNull()
})

test("戻っただけなら、戻った数と［閉じる］だけ", () => {
  open({ moved: [], returned: 3 })
  expect(screen.getByText("読めるようになった物が 3 件戻りました")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "見る", hidden: true })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "閉じる", hidden: true }))
  expect(screen.queryByText("読めるようになった物が 3 件戻りました")).toBeNull()
})
