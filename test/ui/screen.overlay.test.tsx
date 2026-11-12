// スクリーン（base の defineScreen・useOpenScreen・ScreenOverlay）: 開くと重ねて描き、閉じると外し、定義が無い・値が形に合わなければ何も重ねない

import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, render, screen } from "@testing-library/react"
import { z } from "zod"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { defineScreen, ScreenOverlay, useOpenedScreen, useOpenScreen } from "../../web/src/plugins/base/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin } from "../../web/src/store/plugin"
import { definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

const kit = pluginKit("shots", defineMessages({ shot: { en: "Shot", ja: "ショット" } }))
const SHOT = defineScreen({
  id: kit.name("view"),
  title: kit.message("shot") as never,
  props: z.strictObject({ name: z.string() }),
  view: ({ name }) => <p data-testid="shot">shot {name}</p>,
})
const shots = definePlugin({ id: "shots" })
const shotsUi = definePluginUi(shots, { widgets: [SHOT] })

let controls: ReturnType<typeof useOpenScreen>
let opened: ReturnType<typeof useOpenedScreen>
function Probe() {
  controls = useOpenScreen()
  opened = useOpenedScreen()
  return <ScreenOverlay />
}

function setup() {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: [...BUILTIN_UI, shotsUi] as never,
    partial: true,
  } as never)
  render(
    <MatomezuProvider instance={store as never} layout={DEFAULT_LAYOUT}>
      <Probe />
    </MatomezuProvider>,
  )
}

describe("スクリーンの重ね場所", () => {
  test("開くと重ねて描き、閉じると外す。開いている間は inert でない", async () => {
    setup()
    expect(screen.queryByTestId("shot")).toBeNull()
    act(() => controls.open(SHOT, { name: "A" }))
    expect(screen.getByTestId("shot").textContent).toBe("shot A")
    expect(opened).toEqual({ screen: SHOT.id, props: { name: "A" } })
    // 別の値で開き直すと、描き直す
    act(() => controls.open(SHOT, { name: "B" }))
    expect(screen.getByTestId("shot").textContent).toBe("shot B")
    act(() => controls.close())
    expect(opened).toBe("none")
    // 滑り出る間は、まだ描いて、操作は受けない
    expect(document.querySelector("[data-screen-overlay]")?.hasAttribute("inert")).toBe(true)
    await new Promise(r => setTimeout(r, 400))
    expect(screen.queryByTestId("shot")).toBeNull()
  })

  test("定義が無いスクリーン・値が形に合わないスクリーンは、何も重ねない", () => {
    setup()
    act(() => controls.open({ id: "nothing:view", view: () => <p data-testid="shot" /> }, { name: "A" }))
    expect(screen.queryByTestId("shot")).toBeNull()
    act(() => controls.open(SHOT, { name: 1 } as never))
    expect(screen.queryByTestId("shot")).toBeNull()
  })
})
