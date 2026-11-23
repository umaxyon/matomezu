// 開き方の案内: 案内の文とターミナルの行は、利用者が打つ名前（Windows で npm から入れたなら matomezu.cmd）で matomezu open を出す
import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { OPEN_GUIDE_MESSAGES } from "../../../web/src/plugins/base/open-guide/messages"
import { BUILTIN_UI, UNKNOWN_BROWSER_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const HOW = OPEN_GUIDE_MESSAGES["Ask your AI to “run {command}”, or run it in a terminal"].ja

function renderGuide(command?: string) {
  const store = createMatomezu({ plugins: BUILTIN_UI, lang: "ja", ...(command ? { command } : {}) })
  render(
    <MatomezuProvider instance={store} layout={UNKNOWN_BROWSER_LAYOUT} warnings={[]}>
      <WindowRoot />
    </MatomezuProvider>,
  )
}

test("the guide names matomezu open", () => {
  renderGuide()
  expect(screen.getByText(HOW.replace("{command}", "matomezu open"))).toBeTruthy()
})

test("the guide names the command the user types", () => {
  renderGuide("matomezu.cmd")
  expect(screen.getByText(HOW.replace("{command}", "matomezu.cmd open"))).toBeTruthy()
  expect(screen.getByText("matomezu.cmd open")).toBeTruthy()
})
