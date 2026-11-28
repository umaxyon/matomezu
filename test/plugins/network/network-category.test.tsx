// 設定カテゴリ「ネットワーク」: ホスト名・ほかのホストとつなぐ・待ち受けアドレス・鍵の印・AI 用ホストリストに載せるワークルーム・開けなかった理由・WSL の案内
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { userSetting } from "../../../web/src/core/settings"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { CONNECT_HOSTS, HOST_NAME, LISTED_WORKROOMS_SETTING } from "../../../web/src/plugins/network"
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
  const stored = (id: string) => id in store.state.getState().settings
  return { value, stored, setStatus, panel: () => screen.getByRole("tabpanel", { name: "ネットワーク" }) }
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

test("つなぐを入にし、入口が開くと、待ち受けアドレス（番地ごとにコピー）と鍵の印を出す。開けなければ理由の 1 行を出す。切なら出さない", () => {
  const { panel, setStatus, value } = openNetwork()
  setStatus({})
  expect(within(panel()).queryByText("待ち受けアドレス")).toBeNull()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  expect(value(CONNECT_HOSTS.id)).toBe(true)
  setStatus({ open: true, port: 41234, addrs: ["192.168.1.10", "10.0.0.5"] })
  expect(within(panel()).getByText("192.168.1.10:41234")).toBeTruthy()
  expect(within(panel()).getByText("10.0.0.5:41234")).toBeTruthy()
  expect(within(panel()).getAllByRole("button", { name: "コピー" })).toHaveLength(2)
  expect(within(panel()).getByText("7F3A 91C2 0B5E D4A8 …")).toBeTruthy()
  setStatus({ port: 41234, failed: "port-in-use" })
  expect(within(panel()).getByText("ポート 41234 がほかのプログラムに使われていて開けません")).toBeTruthy()
  expect(within(panel()).queryByText("待ち受けアドレス")).toBeNull()
  setStatus({ failed: "listen" })
  expect(within(panel()).getByText("ほかのホストを待つ入口を開けませんでした")).toBeTruthy()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  expect(within(panel()).queryByText("ほかのホストを待つ入口を開けませんでした")).toBeNull()
})

test("WSL で動いていて、つなぐが入でポートが決まっていれば、このホストからつなぐ案内と、相手からも見つけられるようにする手引きを出す", () => {
  const { panel, setStatus } = openNetwork()
  setStatus({ wsl: true })
  expect(within(panel()).queryByText("相手からも見つけられるようにするには")).toBeNull()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  setStatus({ wsl: true, open: true, port: 41234, addrs: ["172.21.69.139"] })
  expect(within(panel()).getByText("WSL では、ほかのマシンからこのホストは見つかりません")).toBeTruthy()
  expect(
    within(panel()).getByText("このホストから相手の待ち受けアドレスを入れてつなぐと、両方から使えます"),
  ).toBeTruthy()
  expect(within(panel()).getByText("相手からも見つけられるようにするには")).toBeTruthy()
  expect(within(panel()).getByText(/-LocalPorts 41234/)).toBeTruthy()
})

test("NAT の WSL では WSLプロキシの札を出す。稼働中は Windows の番地を待ち受けアドレスに出し、WSL の手引きは出さない。非稼働は様子ごとの訳と、立たなかった・止まれば［立て直す］、ポートが使われていれば［別のポートにする］", () => {
  const { panel, setStatus } = openNetwork()
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  const base = { wsl: true, open: true, port: 41234, addrs: ["172.21.69.139"] }
  setStatus({ ...base, wslProxy: "running", wslProxyAddrs: ["192.168.1.20"] })
  expect(within(panel()).getByText("WSLプロキシ稼働中")).toBeTruthy()
  expect(within(panel()).getByText("192.168.1.20:41234")).toBeTruthy()
  expect(within(panel()).queryByText("172.21.69.139:41234")).toBeNull()
  expect(within(panel()).queryByText("相手からも見つけられるようにするには")).toBeNull()
  fireEvent.click(within(panel()).getByRole("button", { name: "WSLプロキシ稼働中" }))
  expect(screen.getByRole("note").textContent).toContain("Windowsファイヤーウォール")
  fireEvent.click(within(panel()).getByRole("button", { name: "WSLプロキシ稼働中" }))
  const why = (state: HostStatus["wslProxy"], text: string) => {
    setStatus({ ...base, wslProxy: state })
    expect(within(panel()).getByText("WSLプロキシ非稼働")).toBeTruthy()
    fireEvent.click(within(panel()).getByRole("button", { name: "WSLプロキシ非稼働" }))
    expect(screen.getByRole("note").textContent).toBe(text)
    fireEvent.click(within(panel()).getByRole("button", { name: "WSLプロキシ非稼働" }))
  }
  why(
    "unavailable",
    "Windows側にもmatomezuの同じバージョンを入れると、中継プロキシが稼働し、LAN内にmatomezuが公開されます",
  )
  expect(within(panel()).getByText("172.21.69.139:41234")).toBeTruthy()
  expect(within(panel()).getByText("相手からも見つけられるようにするには")).toBeTruthy()
  why(
    "update-windows",
    "Windows側とWSL側のmatomezuのバージョンを合わせると中継プロキシが稼働し、LAN内にmatomezuが公開されます",
  )
  expect(within(panel()).getByRole("button", { name: "立て直す" })).toBeTruthy()
  why("starting", "Windows側で中継プロキシを立てています")
  expect(within(panel()).queryByRole("button", { name: "立て直す" })).toBeNull()
  why("listen", "Windows側で待ち受けを開けませんでした")
  expect(within(panel()).getByRole("button", { name: "立て直す" })).toBeTruthy()
  why("stopped", "Windows側の中継プロキシが止まりました")
  expect(within(panel()).getByRole("button", { name: "立て直す" })).toBeTruthy()
  why("port-in-use", "Windows でポート 41234 がほかに使われています")
  expect(within(panel()).getByRole("button", { name: "別のポートにする" })).toBeTruthy()
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
        if (r.kind === "repick-port") asked.push(r)
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

test("WSLプロキシが止まれば［立て直す］で立て直しを頼み、Windows でポートが使われていれば［別のポートにする］の確かめから取り直しを頼む", async () => {
  const asked: unknown[] = []
  const store = createMatomezu({
    controlCenter: CONTROL_CENTER.id,
    books: [],
    lang: "ja",
    plugins: BUILTIN_UI,
    hostsHost: {
      ask: async r => {
        if (r.kind === "restart-wsl-proxy" || r.kind === "repick-port") asked.push(r)
      },
    },
  })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  const proxy = (wslProxy: HostStatus["wslProxy"]) =>
    act(() =>
      store.setHostStatus({ hostId: HOST_ID, name: "d", osHostName: "d", open: true, port: 7240, wsl: true, wslProxy }),
    )
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "ネットワーク" }))
  const panel = () => screen.getByRole("tabpanel", { name: "ネットワーク" })
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  proxy("stopped")
  await act(async () => {
    fireEvent.click(within(panel()).getByRole("button", { name: "立て直す" }))
  })
  expect(asked).toEqual([{ kind: "restart-wsl-proxy" }])
  proxy("port-in-use")
  fireEvent.click(within(panel()).getByRole("button", { name: "別のポートにする" }))
  const dialog = screen.getByRole("dialog", { name: "別のポートにする" })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "別のポートにする" }))
  })
  expect(asked).toEqual([{ kind: "restart-wsl-proxy" }, { kind: "repick-port" }])
})

test("AI 用ホストリストに載せるこのホストのワークルームは、つなぐが切でも［全部｜5 件］で選べ、全部に戻すと値を消す", () => {
  const { panel, value, stored } = openNetwork()
  const all = () => within(panel()).getByRole("radio", { name: "全部のワークルーム" }) as HTMLInputElement
  const recent = () =>
    within(panel()).getByRole("radio", { name: "様子が最近変わった 5 件のワークルーム" }) as HTMLInputElement
  expect(all().checked).toBe(true)
  fireEvent.click(recent())
  expect(value(LISTED_WORKROOMS_SETTING.id)).toBe("recent")
  expect(recent().checked).toBe(true)
  fireEvent.click(all())
  expect(value(LISTED_WORKROOMS_SETTING.id)).toBe("all")
  expect(stored(LISTED_WORKROOMS_SETTING.id)).toBe(false)
  expect(all().checked).toBe(true)
})

test("Windows で直に動くときは、つなぐの下にファイアウォールの［許可する｜許可しない］と赤い行を出す。押すと頼み、答えるまで押せない。許可が効かなければ 1 行を出し、「許可しない」の側に置く", async () => {
  const asked: unknown[] = []
  let answer: () => void = () => {}
  const store = createMatomezu({
    controlCenter: CONTROL_CENTER.id,
    books: [],
    lang: "ja",
    plugins: BUILTIN_UI,
    hostsHost: {
      ask: r => {
        if (r.kind === "firewall") asked.push(r)
        return r.kind === "firewall" ? new Promise<void>(resolve => (answer = resolve)) : Promise.resolve()
      },
    },
  })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  const setStatus = (s: Partial<HostStatus>) =>
    act(() => store.setHostStatus({ hostId: HOST_ID, name: "d", osHostName: "d", open: false, ...s }))
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "ネットワーク" }))
  const panel = () => screen.getByRole("tabpanel", { name: "ネットワーク" })
  const allow = () => within(panel()).getByRole("radio", { name: "matomezu を許可する" }) as HTMLInputElement
  const deny = () => within(panel()).getByRole("radio", { name: "matomezu を許可しない" }) as HTMLInputElement
  setStatus({})
  fireEvent.click(within(panel()).getByRole("switch", { name: "ホストとつなぐ" }))
  expect(within(panel()).queryByText("ファイアウォール設定")).toBeNull()

  setStatus({ firewall: "absent" })
  expect(within(panel()).getByText("ファイアウォール設定")).toBeTruthy()
  expect(within(panel()).getByText("公衆LANでの許可は推奨しません")).toBeTruthy()
  expect(deny().checked).toBe(true)
  expect(within(panel()).queryByText("待ち受けアドレス")).toBeNull()
  fireEvent.click(allow())
  expect(asked).toEqual([{ kind: "firewall", allow: true }])
  expect(allow().checked).toBe(true)
  expect(allow().disabled && deny().disabled).toBe(true)
  setStatus({ firewall: "allowed", open: true, port: 41234, addrs: ["192.168.1.10"] })
  await act(async () => answer())
  expect(allow().disabled).toBe(false)
  expect(allow().checked).toBe(true)
  expect(within(panel()).getByText("192.168.1.10:41234")).toBeTruthy()

  setStatus({ firewall: "ineffective" })
  expect(within(panel()).getByText("許可が有効にできません。管理者に問い合わせてください")).toBeTruthy()
  expect(deny().checked).toBe(true)
  expect(allow().disabled).toBe(false)
})
