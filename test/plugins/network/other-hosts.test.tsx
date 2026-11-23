// コントロールセンターの「ほかのホスト」の節・詳しい所、ホストをつなぐのダイアログ（頼む側）、届いた頼みのしおりとダイアログ（受ける側）。
// 常駐どうしの移り変わり（受け入れ・断り・やめる・解く・not-paired）は Go のテストが確かめる。ここは窓の見え方だけ
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { PAIRED_HOST, PAIRING_REQUEST } from "../../../web/src/plugins/network"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { HostPairing, HostRequest } from "../../../web/src/store/state"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const B = "b".repeat(64)

function open() {
  const asked: HostRequest[] = []
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
  const connect = () => {
    fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
    fireEvent.click(screen.getByRole("tab", { name: "ネットワーク" }))
    fireEvent.click(
      within(screen.getByRole("tabpanel", { name: "ネットワーク" })).getByRole("switch", { name: "ホストとつなぐ" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
  }
  const peers = (paired: { hostId: string; connected: boolean; name?: string }[], pairing?: HostPairing) =>
    act(() => store.setHostPeers({ paired, found: [], ...(pairing ? { pairing } : {}) }))
  return { store, asked, connect, peers }
}

test("「ほかのホスト」の節は、つなぐが入のときだけ出し、出したらつながりを確かめてもらう。行を選ぶと右下に詳しい所、ペアリングを解くと選んでいないのと同じ", async () => {
  const { store, asked, connect, peers } = open()
  expect(screen.queryByText("ほかのホスト")).toBeNull()
  connect()
  expect(screen.getByText("ペアリングしたホストはありません")).toBeTruthy()
  expect(asked).toContainEqual({ kind: "check" })
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  const row = () => screen.getByRole("button", { name: /win-lan/ })
  expect(within(row()).getByRole("img", { name: "つながっていない" })).toBeTruthy()
  peers([{ hostId: B, connected: true, name: "win-lan2" }])
  expect(
    within(screen.getByRole("button", { name: /win-lan2/ })).getByRole("img", { name: "つながっている" }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: /win-lan2/ }))
  const panel = () => document.querySelector("[data-workroom-panel]") as HTMLElement
  expect(within(panel()).getByText("（taro）")).toBeTruthy()
  expect(within(panel()).getByText("BBBB BBBB BBBB BBBB …")).toBeTruthy()
  fireEvent.click(within(panel()).getByRole("button", { name: "ペアリングを解く" }))
  expect(Object.keys(store.state.getState().records[PAIRED_HOST.id] ?? {})).toEqual([])
  expect(within(panel()).queryByText("（taro）")).toBeNull()
})

test("ホストをつなぐ: 頼んでいる様子ごとに、待つ所（接続確認コード）か、うまくいかなかった理由を出す。× はやめると同じ", () => {
  const { asked, connect, peers } = open()
  connect()
  const base = { addr: "192.168.11.20:7240", name: "win-lan", hostId: B }
  const cases: [HostPairing, string][] = [
    [{ ...base, phase: "waiting", code: "482913" }, "win-lan が受け入れるのを待っています"],
    [{ ...base, phase: "declined" }, "win-lan が断りました"],
    [{ ...base, phase: "timed-out" }, "受け入れられないまま時間が切れました"],
    [{ ...base, phase: "unreachable" }, "つながりません"],
    [{ ...base, phase: "refused", reason: "self" }, "このホスト自身です"],
    [
      { ...base, phase: "refused", reason: "busy" },
      "win-lan はほかの頼みに答えている所です。少し待ってやり直して下さい",
    ],
    [{ ...base, phase: "key-mismatch" }, "途中で win-lan の鍵が変わりました。やり直して下さい"],
  ]
  fireEvent.click(screen.getByRole("button", { name: "ホストをつなぐ" }))
  const dialog = () => screen.getByRole("dialog", { name: "ホストをつなぐ" })
  expect(within(dialog()).getByText("見つかったホスト")).toBeTruthy()
  expect(asked).toContainEqual({ kind: "discover" })
  for (const [pairing, text] of cases) {
    peers([], pairing)
    expect(within(dialog()).getByText(text)).toBeTruthy()
  }
  peers([], cases[0]?.[0])
  expect(within(dialog()).getByText("482 913")).toBeTruthy()
  fireEvent.keyDown(dialog(), { key: "Escape" })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(asked.at(-1)).toEqual({ kind: "end-pairing" })
})

test("届いた頼みはしおりとダイアログに出し、断ると消える", () => {
  const { store } = open()
  act(() => {
    store.actions.perform("@matomezu/network:pairing-request-add", {
      hostId: B,
      name: "masa-wsl",
      userName: "masa",
      addr: "192.168.11.11:7240",
      code: "482913",
    })
  })
  fireEvent.click(screen.getByRole("button", { name: "ほかのホストからつなぐ頼みが届きました" }))
  const dialog = screen.getByRole("dialog", { name: "ほかのホストからつなぐ頼みが届きました" })
  expect(within(dialog).getByText("masa-wsl")).toBeTruthy()
  expect(within(dialog).getByText("482 913")).toBeTruthy()
  fireEvent.click(within(dialog).getByRole("button", { name: "断る" }))
  expect(Object.keys(store.state.getState().records[PAIRING_REQUEST.id] ?? {})).toEqual([])
  expect(screen.queryByRole("button", { name: "ほかのホストからつなぐ頼みが届きました" })).toBeNull()
})

test("受け入れられても、ペアリングしたホストが届くまでは開いたまま。届いたら閉じ、その行を選び、終わった様子を消してもらう", () => {
  const { store, asked, connect, peers } = open()
  connect()
  fireEvent.click(screen.getByRole("button", { name: "ホストをつなぐ" }))
  peers([], { addr: "192.168.11.20:7240", name: "win-lan", hostId: B, phase: "accepted", code: "482913" })
  expect(screen.getByRole("dialog", { name: "ホストをつなぐ" })).toBeTruthy()
  asked.length = 0
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  expect(screen.queryByRole("dialog", { name: "ホストをつなぐ" })).toBeNull()
  expect(asked).toEqual([{ kind: "end-pairing" }])
  const panel = document.querySelector("[data-workroom-panel]") as HTMLElement
  expect(within(panel).getByRole("button", { name: "ペアリングを解く" })).toBeTruthy()
})
