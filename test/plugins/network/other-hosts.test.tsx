// コントロールセンターの「ほかのホスト」の節・詳しい所、ホストをつなぐのダイアログ（頼む側）、届いた頼みのしおりとダイアログ（受ける側）。
// 常駐どうしの移り変わり（受け入れ・断り・やめる・解く・not-paired）は Go のテストが確かめる。ここは窓の見え方だけ
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { PAIRED_HOST, PAIRING_REQUEST } from "../../../web/src/plugins/network"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { HostPairing, HostRequest, PeerLive } from "../../../web/src/store/state"
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
  const peers = (paired: PeerLive[], pairing?: HostPairing) =>
    act(() => store.setHostPeers({ paired, found: [], ...(pairing ? { pairing } : {}) }))
  return { store, asked, connect, peers }
}

test("「ほかのホスト」の節は、つなぐが入のときだけ出し、出したときと［↻］を押したときにつながりを確かめてもらう。行を選ぶと右下に詳しい所、ペアリングを解く（確かめてから）と選んでいないのと同じ", async () => {
  const { store, asked, connect, peers } = open()
  expect(screen.queryByText("ほかのホスト")).toBeNull()
  connect()
  expect(screen.getByText("ペアリングしたホストはありません")).toBeTruthy()
  expect(asked).toContainEqual({ kind: "check" })
  const checks = () => asked.filter(r => (r as { kind: string }).kind === "check").length
  const before = checks()
  fireEvent.click(screen.getByRole("button", { name: "つながりを確かめ直す", hidden: true }))
  expect(checks()).toBe(before + 1)
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  const row = () => screen.getByRole("button", { name: /^つながっていない ?win-lan$/ })
  expect(within(row()).getByRole("img", { name: "つながっていない" })).toBeTruthy()
  peers([{ hostId: B, label: "win-lan2", state: "connected", name: "win-lan2" }])
  expect(
    within(screen.getByRole("button", { name: /^つながっている ?win-lan2$/ })).getByRole("img", {
      name: "つながっている",
    }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: /^つながっている ?win-lan2$/ }))
  const panel = () => document.querySelector("[data-workroom-panel]") as HTMLElement
  expect(within(panel()).getByText("（taro）")).toBeTruthy()
  // 待っている所・鍵の印は歯車のダイアログに
  fireEvent.click(within(panel()).getByRole("button", { name: "このホストの様子" }))
  const info = screen.getByRole("dialog", { name: "このホストの様子" })
  expect(within(info).getByText("BBBB BBBB BBBB BBBB …")).toBeTruthy()
  fireEvent.click(within(info).getByRole("button", { name: "閉じる" }))
  fireEvent.click(within(panel()).getByRole("button", { name: "ペアリングを解く" }))
  const confirm = screen.getByRole("dialog", { name: "ペアリングを解く" })
  expect(
    within(confirm).getByText(
      "相手のホストにも知らせます。このホストから届いて、AI がまだ受け取っていないメッセージは消えます。またつなぐには、もう一度ペアリングします",
    ),
  ).toBeTruthy()
  fireEvent.click(within(confirm).getByRole("button", { name: "解く" }))
  expect(screen.queryByRole("dialog")).toBeNull()
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

test("WSL で動いていれば（WSLプロキシが稼働中のときを除く）、ホストをつなぐに一覧に出ないことを言い、待っている所を入れる所を開いて出す。そのほかは畳んだまま", () => {
  const { store, connect } = open()
  connect()
  const status = (wsl: boolean, wslProxy?: "running") =>
    act(() =>
      store.setHostStatus({ hostId: B, name: "desk", osHostName: "desk", open: true, port: 41234, wsl, wslProxy }),
    )
  const dialog = () => screen.getByRole("dialog", { name: "ホストをつなぐ" })
  status(false)
  fireEvent.click(screen.getByRole("button", { name: "ホストをつなぐ" }))
  expect(within(dialog()).queryByText("WSL では、ほかのマシンは一覧に出ません")).toBeNull()
  expect(dialog().querySelector("details")?.open).toBe(false)
  fireEvent.keyDown(dialog(), { key: "Escape" })
  status(true)
  fireEvent.click(screen.getByRole("button", { name: "ホストをつなぐ" }))
  expect(within(dialog()).getByText("WSL では、ほかのマシンは一覧に出ません")).toBeTruthy()
  expect(dialog().querySelector("details")?.open).toBe(true)
  fireEvent.keyDown(dialog(), { key: "Escape" })
  status(true, "running")
  fireEvent.click(screen.getByRole("button", { name: "ホストをつなぐ" }))
  expect(within(dialog()).queryByText("WSL では、ほかのマシンは一覧に出ません")).toBeNull()
  expect(dialog().querySelector("details")?.open).toBe(false)
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

test("ホストの行の ▸ で開くと、相手のワークルームの写しを名前と作業中・空きで出し、AI が生きていない行は薄くして「応答なし」を添え、つながっていなければ「つながっていません」だけ", () => {
  const { store, connect, peers } = open()
  connect()
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  const caret = () => screen.getByRole("button", { name: "win-lan のワークルーム" })
  fireEvent.click(caret())
  expect(caret().getAttribute("aria-expanded")).toBe("true")
  expect(screen.getByText("つながっていません")).toBeTruthy()
  peers([
    {
      hostId: B,
      label: "win-lan",
      state: "connected",
      workrooms: [
        { name: "win_claude_cli", activity: "idle", alive: "alive" },
        { name: "win_haiku", activity: "working", alive: "alive" },
        { name: "win_sleepy", activity: "idle", alive: "lapsed" },
        { name: "win_old", activity: "unknown", alive: "unknown" },
      ],
    },
  ])
  const list = screen.getByRole("list", { name: "win-lan のワークルーム" })
  const items = within(list).getAllByRole("listitem")
  expect(items.map(li => li.textContent)).toEqual([
    "win_claude_cli空き",
    "win_haiku作業中",
    "win_sleepy空き · 応答なし",
    "win_old",
  ])
  expect(items.map(li => li.getAttribute("data-lapsed"))).toEqual(["false", "false", "true", "false"])
  fireEvent.click(caret())
  expect(screen.queryByRole("list", { name: "win-lan のワークルーム" })).toBeNull()
})

test("詳しい所の「〈ホスト〉から届いた指示」: ユーザーの指示に替えるのは確かめのダイアログを通してから替わり（キャンセルなら替わらない）、聞くへはすぐ戻る", () => {
  const { store, connect } = open()
  connect()
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  fireEvent.click(screen.getByRole("button", { name: /^つながっていない ?win-lan$/ }))
  const requests = () =>
    (Object.values(store.state.getState().records[PAIRED_HOST.id] ?? {})[0] as { requests?: string } | undefined)
      ?.requests
  const ask = () =>
    screen.getByRole("radio", { name: "AI の指示: 受け取った AI が、実行してよいかあなたに聞く" }) as HTMLInputElement
  const asUser = () =>
    screen.getByRole("radio", { name: "ユーザーの指示: あなたの指示と同じに扱う" }) as HTMLInputElement
  expect(screen.getByText("win-lanから届いた指示:")).toBeTruthy()
  expect(screen.getByText("の指示として扱う")).toBeTruthy()
  expect(ask().checked).toBe(true)
  fireEvent.click(asUser())
  const confirm = () => screen.getByRole("dialog", { name: "このホストから届いた指示をユーザーの指示として扱う" })
  expect(
    within(confirm()).getByText("あなたのホストの AI が、win-lan の AI から届いた指示を、あなたに聞かずに行います"),
  ).toBeTruthy()
  fireEvent.click(within(confirm()).getByRole("button", { name: "キャンセル" }))
  expect(requests()).toBe("ask-user")
  expect(ask().checked).toBe(true)
  fireEvent.click(asUser())
  fireEvent.click(within(confirm()).getByRole("button", { name: "ユーザーの指示として扱う" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(requests()).toBe("as-user")
  expect(asUser().checked).toBe(true)
  fireEvent.click(ask())
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(requests()).toBe("ask-user")
})

test("詳しい所の目: 押すと AI 用ホストリストから隠し（行に薄い斜線の入った目）、もう一度押すと載せる", () => {
  const { store, connect } = open()
  connect()
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  fireEvent.click(screen.getByRole("button", { name: /^つながっていない ?win-lan$/ }))
  const listed = () =>
    (Object.values(store.state.getState().records[PAIRED_HOST.id] ?? {})[0] as { listed?: string } | undefined)?.listed
  expect(listed()).toBe("listed")
  expect(screen.queryByRole("img", { name: "AI 用ホストリストから隠しています" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "AI 用ホストリストから隠す" }))
  expect(listed()).toBe("hidden")
  expect(screen.getByRole("img", { name: "AI 用ホストリストから隠しています" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "AI 用ホストリストに載せる" }))
  expect(listed()).toBe("listed")
})

test("常駐間通信プロトコルの版が合わないホストは、つながっていない点のまま、詳しい所にどちらを更新すれば合うかの一言を出す", () => {
  const { store, connect, peers } = open()
  connect()
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  peers([{ hostId: B, label: "win-lan", state: "update-this" }])
  fireEvent.click(screen.getByRole("button", { name: /^つながっていない ?win-lan$/ }))
  expect(screen.getByText("matomezu の版が合いません。このホストを更新してください")).toBeTruthy()
  peers([{ hostId: B, label: "win-lan", state: "update-that" }])
  expect(screen.getByText("matomezu の版が合いません。win-lan で更新してください")).toBeTruthy()
  peers([{ hostId: B, label: "win-lan", state: "connected" }])
  expect(screen.queryByText(/matomezu の版が合いません/)).toBeNull()
})

test("このホストの様子の「待っている所」: 相手が張ったリバース接続でだけつながっていれば「相手からつないでいる」、こちらから届けば番地", () => {
  const { store, connect, peers } = open()
  connect()
  act(() => {
    store.actions.perform("@matomezu/network:paired-host-add", {
      hostId: B,
      nameAtPairing: "wsl-nat",
      userNameAtPairing: "taro",
      addr: "",
    })
  })
  peers([{ hostId: B, label: "wsl-nat", state: "connected", addr: "192.168.11.11:7240", reverseOnly: true }])
  fireEvent.click(screen.getByRole("button", { name: /wsl-nat$/ }))
  fireEvent.click(screen.getByRole("button", { name: "このホストの様子" }))
  const dialog = () => screen.getByRole("dialog", { name: "このホストの様子" })
  expect(within(dialog()).getByText("相手からつないでいる")).toBeTruthy()
  expect(within(dialog()).queryByText("192.168.11.11:7240")).toBeNull()
  peers([{ hostId: B, label: "wsl-nat", state: "connected", addr: "192.168.11.11:7240", reverseOnly: false }])
  expect(within(dialog()).getByText("192.168.11.11:7240")).toBeTruthy()
})
