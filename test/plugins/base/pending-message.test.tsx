// 承認待ちの AI 間メッセージ: 受け手の行の吹き出し（承認待ちがあるときだけ出る）と、確認のダイアログ（承認・キャンセル。閉じるだけなら何も頼まない）
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PendingBalloon } from "../../../web/src/plugins/base/participant/PendingBalloon"
import { PendingMessageDialog } from "../../../web/src/plugins/base/participant/PendingMessageDialog"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { PendingMessage } from "../../../web/src/store/state"
import { MatomezuProvider } from "../../../web/src/ui/store-context"

afterEach(cleanup)

const message: PendingMessage = {
  id: "m1",
  receiver: "p-receiver",
  sender: "p-sender",
  senderRoom: "ひよこ",
  senderHost: "",
  senderHostName: "",
  body: "確認してください",
  at: "2026-11-25T00:00:00Z",
}

function setup(answers: [string, string][]) {
  const store = createMatomezu({
    books: [],
    lang: "ja",
    plugins: BUILTIN_UI,
    messageHost: {
      answer: async (id, answer) => {
        answers.push([id, answer])
      },
    },
  })
  return store
}

function renderDialog(store: ReturnType<typeof setup>, onClose: () => void = () => {}) {
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <PendingMessageDialog args={{ message: "m1" }} onClose={onClose} />
    </MatomezuProvider>,
  )
}

test("承認待ちが無ければ吹き出しは出ず、届くと受け手の行に出る", () => {
  const store = setup([])
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <PendingBalloon receiver="p-receiver" />
    </MatomezuProvider>,
  )
  expect(screen.queryByRole("button", { name: "承認待ちのメッセージ", hidden: true })).toBeNull()
  act(() => store.setPendingMessages([message]))
  expect(screen.getByRole("button", { name: "承認待ちのメッセージ", hidden: true })).toBeTruthy()
})

test("ダイアログは送り手のワークルームと本文を出し、承認を頼んで閉じる", async () => {
  const answers: [string, string][] = []
  const store = setup(answers)
  store.setPendingMessages([message])
  let closed = 0
  renderDialog(store, () => closed++)
  expect(screen.getByText("確認してください")).toBeTruthy()
  expect(screen.getByText("送り手: ひよこ")).toBeTruthy()
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "承認", hidden: true }))
  })
  expect(answers).toEqual([["m1", "approve"]])
  expect(closed).toBe(1)
})

test("ほかのホストから届いた物は、送り手にホストエイリアスを添える", () => {
  const store = setup([])
  store.setPendingMessages([{ ...message, sender: "", senderHost: "h-id", senderHostName: "macbook" }])
  renderDialog(store)
  expect(screen.getByText("送り手: macbook の ひよこ")).toBeTruthy()
})

test("キャンセルは cancel を頼む", async () => {
  const answers: [string, string][] = []
  const store = setup(answers)
  store.setPendingMessages([message])
  renderDialog(store)
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "キャンセル", hidden: true }))
  })
  expect(answers).toEqual([["m1", "cancel"]])
})

test("ダイアログを閉じるだけなら、何も頼まずに閉じる（吹き出しは残る）", async () => {
  const answers: [string, string][] = []
  const store = setup(answers)
  store.setPendingMessages([message])
  let closed = 0
  renderDialog(store, () => closed++)
  // 外側を押して閉じる（押し始めも外側）
  const dialog = document.querySelector("dialog") as HTMLElement
  await act(async () => {
    fireEvent.pointerDown(dialog)
    fireEvent.click(dialog)
  })
  expect(answers).toEqual([])
  expect(closed).toBe(1)
})
