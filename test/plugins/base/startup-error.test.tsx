// 起動エラーの画面: 見出し・訳ごとの説明・原因の一覧を出し、直すボタンを押している間と直せたあとは押せない。直せなければ失敗の 2 行を出し、断られたら一覧を残りに替えてまた押せる
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { STARTUP_ERROR } from "../../../web/src/plugins/base/startup-error/ui"
import { BUILTIN_UI } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import type { StartupError, StartupFixOutcome } from "../../../web/src/store/store"
import { defineLayout } from "../../../web/src/ui/layout"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

// 根に起動エラーの画面だけを置く
const LAYOUT = defineLayout({ id: "t", slots: { root: [STARTUP_ERROR.id] }, menus: {} })

const causes = [
  { name: "ex2", reason: "E204 plugin ex2: item ex2:diamond has no view" },
  { name: "ex3", reason: "E204 plugin ex3: item ex3:star has no view" },
]

// 押すたびに、テストが答えを決めるまで待つ直す手で描く
function show(error: Omit<StartupError, "fix">) {
  let answer: (outcome: StartupFixOutcome) => void = () => {}
  let presses = 0
  const fix = () => {
    presses++
    return new Promise<StartupFixOutcome>(r => (answer = r))
  }
  const instance = createMatomezu({ plugins: BUILTIN_UI, lang: "ja", startupError: { ...error, fix } })
  render(
    <MatomezuProvider instance={instance} layout={LAYOUT} warnings={[]}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  const button = () => screen.getByRole("button", { name: "外して開く" })
  const answerWith = async (outcome: StartupFixOutcome) => {
    await act(async () => answer(outcome))
  }
  return { button, answerWith, presses: () => presses }
}

test("見出しと説明と、原因の名前と理由の文を全部と、補足を出す", () => {
  show({ kind: "plugins-not-added", causes })
  expect(screen.getByRole("heading").textContent).toBe("matomezu を開けません")
  expect(screen.getByText("組み込めない追加プラグインがあります")).toBeTruthy()
  expect(
    screen.getByText("外したプラグインのページは読めない物のフォルダへ移り、足し直すと元の所へ戻ります"),
  ).toBeTruthy()
  for (const c of causes) {
    expect(screen.getByText(c.name)).toBeTruthy()
    expect(screen.getByText(c.reason)).toBeTruthy()
  }
})

test("押している間は押せず、断られたら失敗の 2 行（外せませんでした・理由）を出し、一覧を残りに替えて、また押せる", async () => {
  const { button, answerWith, presses } = show({ kind: "plugins-not-added", causes })
  fireEvent.click(button())
  expect((button() as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(button())
  expect(presses()).toBe(1)
  await answerWith({ state: "refused", reason: "busy", causes: causes.slice(1) })
  expect(screen.getByRole("alert").textContent).toBe("外せませんでしたbusy")
  expect(screen.queryByText("ex2")).toBeNull()
  expect(screen.getByText("ex3")).toBeTruthy()
  expect((button() as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button())
  expect(presses()).toBe(2)
})

test("常駐につながらなければ、2 行目は「常駐につながりません」で、一覧はそのまま", async () => {
  const { button, answerWith } = show({ kind: "plugins-not-added", causes })
  fireEvent.click(button())
  await answerWith({ state: "unreachable" })
  expect(screen.getByRole("alert").textContent).toBe("外せませんでした常駐につながりません")
  expect(screen.getByText("ex2")).toBeTruthy()
})

test("直せたあと（窓を読み直す間）は押せないまま", async () => {
  const { button, answerWith } = show({ kind: "plugins-not-added", causes })
  fireEvent.click(button())
  await answerWith({ state: "fixed" })
  expect((button() as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole("alert")).toBeNull()
})

test("起動エラーの画面に出す物を渡していない窓で描くと E214", () => {
  const instance = createMatomezu({ plugins: BUILTIN_UI, lang: "ja" })
  const quiet = console.error
  console.error = () => {}
  try {
    expect(() =>
      render(
        <MatomezuProvider instance={instance} layout={LAYOUT} warnings={[]}>
          <WindowRoot />
        </MatomezuProvider>,
      ),
    ).toThrow(expect.objectContaining({ code: "E214" }))
  } finally {
    console.error = quiet
  }
})
