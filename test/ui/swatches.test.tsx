import { afterEach, expect, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { useSwatches } from "../../web/src/plugins/base/item-parts/parts"
import { BOX_FILL } from "../../web/src/plugins/items/box/box"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"

// 色の見本（useSwatches）は、ブックの中身と同じく、利用者の OS の明暗の値で見せる

const real = globalThis.matchMedia
afterEach(() => {
  cleanup()
  globalThis.matchMedia = real
})

// OS の明暗を、暗い（dark）か明るいかにした matchMedia
const scheme = (dark: boolean) => {
  globalThis.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia
}

// 代表色と箱の塗りを明暗で違う色にしたテーマを持つプラグイン（ほかの値は標準のテーマのまま）
const kit = pluginKit("@ex/dusk", defineMessages({ dusk: { en: "Dusk", ja: "夕暮れ" } }))
const standard = createMatomezu({ plugins: BUILTIN_UI }).catalog.core.themes.get("@matomezu/base:standard")!
const DUSK = kit.defineTheme({
  id: "dusk",
  title: "dusk",
  themeTypes: "all",
  base: standard.base,
  palette: { ...standard.palette, primary: { light: "#3366cc", dark: "#99bbff" } },
  tokens: { "@matomezu/box:box-fill": { light: "#ffffff", dark: "#202020" } },
})
const PLUGINS = [...BUILTIN_UI, definePluginUi(kit.plugin({ themes: [DUSK] }), {})]

function swatchesIn(theme: string) {
  const store = createMatomezu({ plugins: PLUGINS, partial: true })
  let got: ReturnType<typeof useSwatches> = null
  const Probe = () => {
    got = useSwatches(theme, BOX_FILL)
    return null
  }
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Probe />
    </MatomezuProvider>,
  )
  return { got: got as ReturnType<typeof useSwatches> }
}

test("明暗で色の違うテーマの見本は、OS が暗ければ暗いほうの値、明るければ明るいほうの値", () => {
  scheme(true)
  const dark = swatchesIn(DUSK.id).got!
  expect(dark.palette.find(p => p.name === "primary")?.hex).toBe("#99bbff")
  expect(dark.none).toBe("#202020")
  cleanup()
  scheme(false)
  const light = swatchesIn(DUSK.id).got!
  expect(light.palette.find(p => p.name === "primary")?.hex).toBe("#3366cc")
  expect(light.none).toBe("#ffffff")
})
