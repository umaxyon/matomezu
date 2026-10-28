// 画面の入口: ホストクライアント（ホストから開いていればホストに頼むもの、ファイルから開いていれば見本のブックを持つメモリ）から残したブックと設定を読み、ビルトインプラグインと見た目でインスタンスを作り、React の根に Screen を描く。行ったアクションと外の変化はホストクライアントを通してやり取りし、画面の場所は URL と行き来させる。
// 常駐の URL から開いて常駐につながらないときは、メモリで始めずに、つながるまで待つ（起動の失敗なので画面には出さない）。
// ホストが足した追加プラグインも、ホストクライアントが読んだものをビルトインプラグインの後ろに足す。追加プラグインが借りる実物（plugin-modules）は、読む前に globalThis.__matomezuModules に置く

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { fail } from "./core/errors"
import { warning } from "./core/warnings"
import { followLocation } from "./host-client/location"
import { memoryClient } from "./host-client/memory"
import { openClient } from "./host-client/open"
import { UI_MODULES } from "./plugin-modules/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "./plugins/ui"
import { SAMPLE_BOOKS } from "./sample-books"
import { createMatomezu } from "./store/create"
import { loadFonts } from "./ui/fonts"
import { placeAdded } from "./ui/layout"
import { type AnyPluginUi, assembleUi } from "./ui/plugin"
import { Screen } from "./ui/Screen"
import { MatomezuProvider, shownLayout } from "./ui/store-context"
import "./ui/skin.css"

loadFonts()
;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = UI_MODULES
const { client, loaded: saved } = await openClient(() => memoryClient(SAMPLE_BOOKS))
const store = createMatomezu({
  plugins: BUILTIN_UI,
  home: "@matomezu/master:master",
  savedBooks: saved.books,
  settings: saved.settings,
  lang: navigator.languages,
  observe: done => client.observe(done),
  trash: client,
})
// 取り込んだ追加プラグインは、matomezu 本体の core/catalog.ts の型に入らないので、型では確かめず、組み立てで確かめる（見た目と、置いた配置も）。
// 読み込めないもの・組み立てられないもの・配置が食い違うものは外す（ほかのプラグインとブックは使える）
const added = store.use(saved.plugins as AnyPluginUi[], all => {
  shownLayout(placeAdded(DEFAULT_LAYOUT, all), all, assembleUi(all))
})
const failed = [...saved.failed, ...added.failed]
for (const { id, error } of failed) console.error(`plugin ${id} is not added:`, error)
const layout = placeAdded(DEFAULT_LAYOUT, store.plugins)
// 外した理由を文にする（warning W011 の値）
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
// 画面が見つけた warning をホストに知らせる（ホストが集めてログと AI に出す）: 配置で飛ばした物（W010）と、外した追加プラグイン（W011。
// ホストのエンジンには入っているので、AI は使えるのに画面には出ない）
client.reportWarnings([
  ...shownLayout(layout, store.plugins, assembleUi(store.plugins)).warnings,
  ...failed.map(f => warning("W011", f.id, { reason: reasonOf(f.error) })),
])
client.connect(store)
// 画面の場所を URL と行き来させる（読み直しても同じ所が開き、ブラウザの戻る・進むで移動を戻る）
followLocation(store)
const root = document.getElementById("root")
if (!root) fail("E202")

createRoot(root).render(
  <StrictMode>
    <MatomezuProvider instance={store} layout={layout}>
      <Screen />
    </MatomezuProvider>
  </StrictMode>,
)
