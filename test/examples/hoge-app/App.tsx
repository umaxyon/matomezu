// 開発者のアプリの見本: ビルトインプラグインと、作り手の違う外のプラグイン（hoge・hoge-flow・fuga）で app を作り、既定の配置を写して外のウィジェットをステージの上と下の行に置く
import {
  App,
  BUILTIN_UI,
  createMatomezu,
  DEFAULT_LAYOUT,
  defineLayout,
  MatomezuProvider,
  SAMPLE_BOOKS,
} from "matomezu/testing"
import { FUGA_UI } from "../plugins/fuga/ui"
import { HOGE_UI } from "../plugins/hoge/ui"
import { HOGE_FLOW_UI } from "../plugins/hoge-flow/ui"

export const makeApp = () =>
  createMatomezu({
    plugins: [...BUILTIN_UI, HOGE_UI, HOGE_FLOW_UI, FUGA_UI],
    home: "master",
    books: SAMPLE_BOOKS,
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

export function HogeApp({ app }: { app: ReturnType<typeof makeApp> }) {
  return (
    <MatomezuProvider app={app} layout={HOGE_LAYOUT}>
      <App />
    </MatomezuProvider>
  )
}
