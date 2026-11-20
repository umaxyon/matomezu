// 書庫の画面の読めない物のフォルダ: ツリーの下の「⚠ 読めない物 N 件」から開き、一覧に名前・元の場所・読めない訳を出し、選んだ行を確かめてから完全に消す。設定がオンならツリーにも出る
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { HOME_ID, UNREADABLE_ID } from "../../../web/src/core/folders"
import { PURGED } from "../../../web/src/core/unreadable"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"
import { SAMPLE_BOOKS } from "../../sample-books"
import { showFirstBook, worldRows } from "../../support"

afterEach(cleanup)

// 読めない物のフォルダに、タイプのプラグインが無いページ 1 つ（書庫ホームに居た）と、形に合わないブック 1 つ（あとから移った）を置いた窓
function setup() {
  const purged: string[] = []
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
    plugins: BUILTIN_UI,
    books: SAMPLE_BOOKS,
    unreadableHost: {
      purge: async id => {
        purged.push(id)
        return PURGED
      },
      movedIfOff: async () => [],
    },
  })
  showFirstBook(store)
  const world = worldRows(SAMPLE_BOOKS)
  const ref = (kind: string, id: string, code: string, moved: string, type?: string) => ({
    entry: { kind, id },
    from: [HOME_ID],
    after: "none",
    code,
    ...(type ? { type } : {}),
    moved,
  })
  act(() =>
    store.receive(
      {
        pages: [...world.pages, { kind: "page", id: "u1", type: "@ex/stamps:stamp", title: "押印の表" }],
        folders: [
          ...world.folders,
          { folderRole: "book", id: "u2", title: "古い案", lineup: "壊れた" },
          {
            folderRole: "unreadable",
            id: UNREADABLE_ID,
            lineup: [
              ref("page", "u1", "W027", "2026-11-20T12:05:00.000Z", "@ex/stamps:stamp"),
              ref("book", "u2", "W005", "2026-11-19T00:12:00.000Z"),
            ],
          },
        ],
        settings: {},
      },
      [],
    ),
  )
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getAllByRole("button", { name: "書庫", hidden: true })[0] as HTMLElement)
  return { store, purged }
}

test("ツリーの下の「⚠ 読めない物 N 件」から開くと、新しい順に名前・元の場所・読めない訳が並び、選んだ行の「完全に消す」は確かめてから消す", async () => {
  const { purged } = setup()
  const tree = within(screen.getByRole("navigation", { name: "フォルダ", hidden: true }))
  expect(tree.queryByRole("button", { name: "読めない物", hidden: true })).toBeNull() // 設定がオフなら、ツリーには出さない
  fireEvent.click(screen.getByRole("button", { name: "⚠ 読めない物 2 件", hidden: true }))
  const list = within(screen.getByRole("list", { name: "読めない物", hidden: true }))
  const rows = list.getAllByRole("button", { hidden: true })
  expect(rows.map(r => r.textContent)).toEqual([
    expect.stringMatching(/^押印の表書庫プラグインがありません: @ex\/stamps/),
    expect.stringMatching(/^古い案書庫形が合いません/),
  ])
  fireEvent.click(rows[1] as HTMLElement)
  fireEvent.click(screen.getByRole("button", { name: "完全に消す", hidden: true }))
  expect(screen.getByText("「古い案」が完全に消えます")).toBeTruthy()
  expect(screen.getByText("中身も一緒に消えます")).toBeTruthy()
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "完全に消す", hidden: true }).at(-1) as HTMLElement)
  })
  expect(purged).toEqual(["u2"])
})
