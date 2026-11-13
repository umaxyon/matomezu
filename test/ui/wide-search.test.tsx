// 横断検索: モードと開き方はスロットに置いたウィジェットから引ける。コントロールセンターの虫メガネで左サイドパネルに横断検索が開き、全文で打つと横断検索の当たりが並び、押すとチケットスクリーンが開く
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { assembleUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"
import { memoryClient } from "../host-client/memory"

afterEach(cleanup)

const TICKET = "@matomezu/taskboard:ticket"
const HISTORY = "@matomezu/taskboard:ticket-history"
const MODES = "@matomezu/base:wide-search-modes"
const OPENERS = "@matomezu/base:wide-search-openers"
const at = "2026-01-01T00:00:00.000Z"
const by = { kind: "user" }

test("モードと種類ごとの開き方は、スロットに置いたウィジェットが名乗る（モードは置いた順）", () => {
  const widgets = assembleUi(BUILTIN_UI).widgets
  const modes = (DEFAULT_LAYOUT.slots[MODES] ?? []).map(id => widgets.get(id)?.wideSearchMode?.title)
  expect(modes).toEqual(["@matomezu/taskboard:Tickets", "@matomezu/base:Full text"])
  const kinds = (DEFAULT_LAYOUT.slots[OPENERS] ?? []).map(id => widgets.get(id)?.forKind)
  expect(kinds).toEqual([TICKET, HISTORY])
})

test("虫メガネで横断検索が開き、全文で打つと当たりが並び、履歴の当たりを押すと親のチケットのスクリーンが開く", async () => {
  const client = memoryClient()
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: BUILTIN_UI,
    search: q => client.search(q),
  })
  client.connect(store)
  act(() =>
    store.receive(
      {
        books: [],
        settings: {},
        records: {
          [TICKET]: {
            t1: {
              id: "t1",
              project: "p1",
              number: 1,
              name: "ログイン",
              body: "",
              lane: "todo",
              tags: [],
              priority: "medium",
              assignees: [],
              createdAt: at,
              createdBy: by,
              updatedAt: at,
            },
          },
          [HISTORY]: { h1: { id: "h1", ticket: "t1", topic: "topic-status", text: "確認が済んだ", at, by } },
        },
      },
      [],
    ),
  )
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "横断検索" }))
  fireEvent.click(await screen.findByRole("button", { name: "全文" }))
  fireEvent.change(await screen.findByRole("textbox", { name: "検索する言葉" }), { target: { value: "確認" } })
  // 横断検索の当たりの名前は、画面の持つチケットから番号の見せ方で作る（ホストの題の数字のままにしない）
  fireEvent.click(await screen.findByRole("button", { name: /0001 ログイン.*確認.*が済んだ/ }, { timeout: 2000 }))
  await waitFor(() =>
    expect(store.state.getState().window.screens.map(s => [s.def, s.props])).toContainEqual([
      "@matomezu/taskboard:ticket-screen",
      { ticket: "t1" },
    ]),
  )
  // 左サイドパネルは開いたまま
  expect(screen.queryByRole("textbox", { name: "検索する言葉" })).not.toBeNull()
})
