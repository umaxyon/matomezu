// matomezu/testing で組む見本: ビルトインプラグインと、作り手の違う追加プラグイン（hoge・hoge-flow・fuga）でインスタンスを作り、既定の配置を写して外のウィジェットをステージの上と下の行に置く
import { App, BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, defineLayout, MatomezuProvider } from "matomezu/testing"
import { FUGA_UI } from "../plugins/fuga/ui"
import { HOGE_UI } from "../plugins/hoge/ui"
import { HOGE_FLOW_UI } from "../plugins/hoge-flow/ui"

export const makeInstance = () =>
  createMatomezu({
    plugins: [...BUILTIN_UI, HOGE_UI, HOGE_FLOW_UI, FUGA_UI],
    home: "master",
    lang: "ja",
  })

export const HOGE_LAYOUT = defineLayout({
  ...DEFAULT_LAYOUT,
  id: "hoge",
  slots: {
    ...DEFAULT_LAYOUT.slots,
    "stage.top": ["toolbox", "hoge/buttons"],
    "stage.bottom": [...DEFAULT_LAYOUT.slots["stage.bottom"], "fuga/mint-button"],
  },
})

export function HogeApp({ instance }: { instance: ReturnType<typeof makeInstance> }) {
  return (
    <MatomezuProvider instance={instance} layout={HOGE_LAYOUT}>
      <App />
    </MatomezuProvider>
  )
}
