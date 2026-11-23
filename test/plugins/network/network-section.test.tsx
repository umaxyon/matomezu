// 設定カテゴリ「ユーザー設定」: ユーザー名（コントロールセンターの「あなた」に出る）と、節「ネットワーク設定」（ホスト名・ほかのホストとつなぐ・待っている所・鍵の印・WSL の案内）
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { userSetting } from "../../../web/src/core/settings"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { CONNECT_HOSTS, HOST_NAME } from "../../../web/src/plugins/network"
import { shownHostKey } from "../../../web/src/plugins/network/NetworkSection"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { HostStatus } from "../../../web/src/store/state"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const HOST_ID = "7f3a91c20b5ed4a8".padEnd(64, "0")

function openUserSettings() {
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
  return { store, value, setStatus, panel: () => screen.getByRole("tabpanel", { name: "ユーザー設定" }) }
}

test("鍵の印は、ホスト id の頭 16 桁を大文字で 4 桁ずつ区切る", () => {
  expect(shownHostKey(HOST_ID)).toBe("7F3A 91C2 0B5E D4A8 …")
})

test("設定画面は「ユーザー設定」で開き、ユーザー名を変えるとコントロールセンターの「あなた」がその名前になる。空に戻せば「あなた」", () => {
  const { panel } = openUserSettings()
  expect(screen.getByRole("tab", { name: "ユーザー設定" }).getAttribute("aria-selected")).toBe("true")
  const name = within(panel()).getByLabelText("ユーザー名") as HTMLInputElement
  expect(name.placeholder).toBe("あなた")
  fireEvent.change(name, { target: { value: "まさ" } })
  fireEvent.blur(name)
  fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
  expect(screen.getByText("まさ")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  const again = within(panel()).getByLabelText("ユーザー名") as HTMLInputElement
  fireEvent.change(again, { target: { value: "" } })
  fireEvent.blur(again)
  fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
  expect(screen.queryByText("まさ")).toBeNull()
  expect(screen.getByText("あなた")).toBeTruthy()
})

test("ネットワーク設定の項目は「ユーザー設定」の節に並び、「全体」には出ない。ホスト名は空なら OS のホスト名を薄く出す", () => {
  const { panel, setStatus, value } = openUserSettings()
  setStatus({ osHostName: "masa-desk" })
  expect(within(panel()).getByRole("heading", { name: "ネットワーク設定" })).toBeTruthy()
  const host = within(panel()).getByLabelText("ホスト名") as HTMLInputElement
  expect(host.placeholder).toBe("masa-desk")
  fireEvent.change(host, { target: { value: "書斎の Mac" } })
  fireEvent.blur(host)
  expect(value(HOST_NAME.id)).toBe("書斎の Mac")
  fireEvent.click(screen.getByRole("tab", { name: "全体" }))
  const general = screen.getByRole("tabpanel", { name: "全体" })
  expect(within(general).queryByLabelText("ホスト名")).toBeNull()
  expect(within(general).queryByText("ほかのホストとつなぐ")).toBeNull()
})

test("つなぐを入にし、入口が開くと、待っている所（番地ごとにコピー）と鍵の印を出す。開けなければその 1 行を出す。切なら出さない", () => {
  const { panel, setStatus, value } = openUserSettings()
  setStatus({})
  expect(within(panel()).queryByText("待っている所")).toBeNull()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ほかのホストとつなぐ" }))
  expect(value(CONNECT_HOSTS.id)).toBe(true)
  setStatus({ open: true, port: 41234, addrs: ["192.168.1.10", "10.0.0.5"] })
  expect(within(panel()).getByText("192.168.1.10:41234")).toBeTruthy()
  expect(within(panel()).getByText("10.0.0.5:41234")).toBeTruthy()
  expect(within(panel()).getAllByRole("button", { name: "コピー" })).toHaveLength(2)
  expect(within(panel()).getByText("7F3A 91C2 0B5E D4A8 …")).toBeTruthy()
  setStatus({ failed: "listen" })
  expect(within(panel()).getByText("ほかのホストを待つ入口を開けませんでした")).toBeTruthy()
  expect(within(panel()).queryByText("待っている所")).toBeNull()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ほかのホストとつなぐ" }))
  expect(within(panel()).queryByText("ほかのホストを待つ入口を開けませんでした")).toBeNull()
})

test("WSL で動いているときだけ、ほかのマシンから届かせる設定の案内を出す", () => {
  const { panel, setStatus } = openUserSettings()
  setStatus({})
  expect(within(panel()).queryByText("設定のしかた")).toBeNull()
  setStatus({ wsl: true, open: true, port: 41234, addrs: ["172.21.69.139"] })
  expect(within(panel()).getByText("WSL では、設定するまでほかのマシンからこのホストに届きません")).toBeTruthy()
  expect(within(panel()).getByText(/-LocalPorts 41234/)).toBeTruthy()
})
