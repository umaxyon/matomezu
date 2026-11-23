// 設定カテゴリ「ネットワーク」: ホスト名・ほかのホストとつなぐ・待っている所・鍵の印・開けなかった理由・WSL の案内
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { userSetting } from "../../../web/src/core/settings"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { CONNECT_HOSTS, HOST_NAME } from "../../../web/src/plugins/network"
import { shownHostKey } from "../../../web/src/plugins/network/NetworkCategory"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { HostStatus } from "../../../web/src/store/state"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const HOST_ID = "7f3a91c20b5ed4a8".padEnd(64, "0")

function openNetwork() {
  const store = createMatomezu({ controlCenter: CONTROL_CENTER.id, books: [], lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  const value = (id: string) => userSetting(store.catalog.core, store.state.getState().settings, id)
  const setStatus = (s: Partial<HostStatus>) =>
    act(() => store.setHostStatus({ hostId: HOST_ID, name: "desk", osHostName: "desk", open: false, ...s }))
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "ネットワーク" }))
  return { value, setStatus, panel: () => screen.getByRole("tabpanel", { name: "ネットワーク" }) }
}

test("鍵の印は、ホスト id の頭 16 桁を大文字で 4 桁ずつ区切る", () => {
  expect(shownHostKey(HOST_ID)).toBe("7F3A 91C2 0B5E D4A8 …")
})

test("ホスト名とつなぐの項目は「ネットワーク」に並び、「全体」には出ない。ホスト名は空なら OS のホスト名を薄く出す", () => {
  const { panel, setStatus, value } = openNetwork()
  setStatus({ osHostName: "masa-desk" })
  const host = within(panel()).getByLabelText("ホスト名") as HTMLInputElement
  expect(host.placeholder).toBe("masa-desk")
  fireEvent.change(host, { target: { value: "書斎の Mac" } })
  fireEvent.blur(host)
  expect(value(HOST_NAME.id)).toBe("書斎の Mac")
  fireEvent.click(screen.getByRole("tab", { name: "全体" }))
  const general = screen.getByRole("tabpanel", { name: "全体" })
  expect(within(general).queryByLabelText("ホスト名")).toBeNull()
  expect(within(general).queryByText("ホストとつなぐ")).toBeNull()
})

test("つなぐを入にし、入口が開くと、待っている所（番地ごとにコピー）と鍵の印を出す。開けなければ理由の 1 行を出す。切なら出さない", () => {
  const { panel, setStatus, value } = openNetwork()
  setStatus({})
  expect(within(panel()).queryByText("待っている所")).toBeNull()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  expect(value(CONNECT_HOSTS.id)).toBe(true)
  setStatus({ open: true, port: 41234, addrs: ["192.168.1.10", "10.0.0.5"] })
  expect(within(panel()).getByText("192.168.1.10:41234")).toBeTruthy()
  expect(within(panel()).getByText("10.0.0.5:41234")).toBeTruthy()
  expect(within(panel()).getAllByRole("button", { name: "コピー" })).toHaveLength(2)
  expect(within(panel()).getByText("7F3A 91C2 0B5E D4A8 …")).toBeTruthy()
  setStatus({ port: 41234, failed: "port-in-use" })
  expect(within(panel()).getByText("ポート 41234 がほかのプログラムに使われていて開けません")).toBeTruthy()
  expect(within(panel()).queryByText("待っている所")).toBeNull()
  setStatus({ failed: "listen" })
  expect(within(panel()).getByText("ほかのホストを待つ入口を開けませんでした")).toBeTruthy()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  expect(within(panel()).queryByText("ほかのホストを待つ入口を開けませんでした")).toBeNull()
})

test("WSL で動いていて、つなぐが入でポートが決まっていれば、ほかのマシンから届かせる設定の案内を出す", () => {
  const { panel, setStatus } = openNetwork()
  setStatus({ wsl: true })
  expect(within(panel()).queryByText("設定のしかた")).toBeNull()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  setStatus({ wsl: true, open: true, port: 41234, addrs: ["172.21.69.139"] })
  expect(within(panel()).getByText("WSL では、設定するまでほかのマシンからこのホストに届きません")).toBeTruthy()
  expect(within(panel()).getByText(/-LocalPorts 41234/)).toBeTruthy()
})

test("覚えたポートが使われていれば［別のポートにする］を出し、確かめのダイアログで頼む。どちらで閉じても「ネットワーク」に戻る", async () => {
  const asked: unknown[] = []
  const store = createMatomezu({
    controlCenter: CONTROL_CENTER.id,
    books: [],
    lang: "ja",
    plugins: BUILTIN_UI,
    hostsHost: {
      ask: async r => {
        asked.push(r)
      },
    },
  })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  const taken = () =>
    act(() =>
      store.setHostStatus({
        hostId: HOST_ID,
        name: "d",
        osHostName: "d",
        open: false,
        port: 7240,
        failed: "port-in-use",
      }),
    )
  taken()
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "ネットワーク" }))
  fireEvent.click(
    within(screen.getByRole("tabpanel", { name: "ネットワーク" })).getByRole("switch", { name: "ホストとつなぐ" }),
  )
  taken()
  const open = () =>
    fireEvent.click(
      within(screen.getByRole("tabpanel", { name: "ネットワーク" })).getByRole("button", { name: "別のポートにする" }),
    )
  open()
  const dialog = () => screen.getByRole("dialog", { name: "別のポートにする" })
  expect(within(dialog()).getByText(/ポート 7240 に足したファイアウォールの規則/)).toBeTruthy()
  fireEvent.click(within(dialog()).getByRole("button", { name: "キャンセル" }))
  expect(asked).toEqual([])
  open()
  await act(async () => {
    fireEvent.click(within(dialog()).getByRole("button", { name: "別のポートにする" }))
  })
  expect(asked).toEqual([{ kind: "repick-port" }])
  expect(screen.getByRole("tabpanel", { name: "ネットワーク" })).toBeTruthy()
})
