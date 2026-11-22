// 設定カテゴリ「更新」: 今の版・新しい版・確かめた時刻と［更新を確認］・自動で確かめるスイッチ。新しい版があれば、
// 管理者のワークルームに生きている AI がいれば［管理者（名前）に更新を頼む］、いなければ端末で打つコマンドを出す
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { StoreApi } from "zustand"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { UPDATE_CATEGORY } from "../../../web/src/plugins/base/update/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { MatomezuState } from "../../../web/src/store/state"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

// 設定画面の「更新」を開く。［更新を確認］を押した数と、頼んだワークルームを数える。admin なら、管理者のワークルーム「ひよこ」に生きている AI を置く
function renderUpdates({ admin = false, there = true, command = undefined as string | undefined } = {}) {
  const asked: string[] = []
  let checks = 0
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: [],
    lang: "ja",
    plugins: BUILTIN_UI,
    ...(command ? { command } : {}),
    updateHost: {
      check: async () => {
        checks++
        store.setUpdateStatus({
          state: "current",
          version: "0.3.0",
          latest: "0.3.0",
          checkedAt: "2026-11-22T03:00:00Z",
        })
      },
      ask: async workroom => {
        asked.push(workroom)
        if (there) store.setUpdateStatus({ ...store.state.getState().updateStatus!, askedAt: "2026-11-22T04:00:00Z" })
        return there
      },
    },
  })
  if (admin) seedAdmin(store)
  store.setUpdateStatus({ state: "newer", version: "0.3.0", latest: "0.3.1", checkedAt: "2026-11-22T02:00:00Z" })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "更新" }))
  return { panel: () => screen.getByRole("tabpanel", { name: "更新" }), checks: () => checks, asked }
}

// 管理者のワークルーム「ひよこ」に、受け入れられて今呼ばれた AI を置く
function seedAdmin(store: ReturnType<typeof createMatomezu>) {
  type Done = { ok: boolean; result?: { participant?: string; workroom?: string } }
  const perform = store.actions.perform as unknown as (id: string, args: unknown, on?: { record: string }) => Done
  const participant = perform("@matomezu/base:participant-request", {
    ai: "claude",
    model: "opus",
    env: "wsl",
    sessionName: "s",
    link: "L1",
  }).result?.participant as string
  const room = perform("@matomezu/base:workroom-add", { name: "ひよこ", bird: "inko" }).result?.workroom as string
  perform("@matomezu/base:participant-accept", { workroom: room }, { record: participant })
  perform("@matomezu/base:admin-set", { workroom: room })
  // 生きているかと準備中でないかは、常駐だけが持ってホストが知らせる。ここでは状態に直に置く
  ;(store.state as unknown as StoreApi<MatomezuState>).setState({
    participantReady: [participant],
    participantCalls: { [participant]: new Date().toISOString() },
  })
}

test("「更新」は既定の UI マッピングの設定カテゴリの最後に並ぶ", () => {
  expect(DEFAULT_LAYOUT.slots["@matomezu/base:settings-categories"]?.at(-1)).toBe(UPDATE_CATEGORY.id)
})

test("新しい版があれば、その版と、端末で打つコマンドを出す。確かめ直して最新なら、「最新です」にしてコマンドを消す", async () => {
  const { panel, checks } = renderUpdates()
  expect(panel().textContent).toContain("0.3.1")
  expect(within(panel()).getByText("matomezu update")).toBeTruthy()
  expect(within(panel()).getByLabelText("新しい版を自動で確かめる")).toBeTruthy()
  await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "更新を確認" })))
  expect(checks()).toBe(1)
  expect(panel().textContent).toContain("最新です")
  expect(within(panel()).queryByText("matomezu update")).toBeNull()
})

test("管理者のワークルームに生きている AI がいれば、コマンドの代わりに頼むボタンを出し、押すとそのワークルームに頼んで時刻を出す", async () => {
  const { panel, asked } = renderUpdates({ admin: true })
  expect(within(panel()).queryByText("matomezu update")).toBeNull()
  await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "管理者（ひよこ）に更新を頼む" })))
  expect(asked).toHaveLength(1)
  expect(panel().textContent).toContain("頼みました")
})

test("頼んだワークルームに AI がいなかったら、ボタンを消して端末で打つコマンドを出す", async () => {
  const { panel } = renderUpdates({ admin: true, there: false })
  await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "管理者（ひよこ）に更新を頼む" })))
  expect(within(panel()).getByText("matomezu update")).toBeTruthy()
})

test("Windows で npm から入れた常駐なら、端末で打つコマンドを matomezu.cmd update にする（matomezu.ps1 は PowerShell の既定で止まる）", () => {
  const { panel } = renderUpdates({ command: "matomezu.cmd" })
  expect(within(panel()).getByText("matomezu.cmd update")).toBeTruthy()
})
