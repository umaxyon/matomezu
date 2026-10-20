// 開発者のアプリの見本: 中の部品と自分のプラグインで app を作り、既定の配置を写して自分のウィジェットをステージの上の行に置く
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../../web/src/sample-books"
import { createMatomezu } from "../../../web/src/store/create"
import { App } from "../../../web/src/ui/App"
import { defineLayout } from "../../../web/src/ui/layout"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { HOGE_UI } from "./hoge-dialog/ui"

export const makeApp = () => createMatomezu({ plugins: [...BUILTIN_UI, HOGE_UI], home: "master", books: SAMPLE_BOOKS })

export const HOGE_LAYOUT = defineLayout({
  ...DEFAULT_LAYOUT,
  id: "hoge",
  slots: { ...DEFAULT_LAYOUT.slots, "stage.top": ["toolbox", "hoge/buttons"] },
})

export function HogeApp({ app }: { app: ReturnType<typeof makeApp> }) {
  return (
    <MatomezuProvider app={app} layout={HOGE_LAYOUT}>
      <App />
    </MatomezuProvider>
  )
}
