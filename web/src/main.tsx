// 画面の入口: ホストクライアント（ホストから開いていればホストに頼むもの、そうでなければ見本のブックを持つメモリ）から残したブックと設定を読み、ビルトインプラグインと見た目でインスタンスを作り、React の根に Screen を描く。行ったアクションと外の変化はホストクライアントを通してやり取りする。
// ホストが足した追加プラグインも、ホストクライアントが読んだものをビルトインプラグインの後ろに足す。追加プラグインが借りる実物（plugin-modules）は、読む前に globalThis.__matomezuModules に置く

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { fail } from "./core/errors"
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
import { MatomezuProvider } from "./ui/store-context"
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
})
// 追加プラグインは機能台帳の型の側に入らないので、型では確かめず、組み立てで確かめる（見た目も）。組み立てられないものは外す
for (const { id, error } of store.use(saved.plugins as AnyPluginUi[], all => assembleUi(all)).failed)
  console.error(`plugin ${id} is not added:`, error)
client.connect(store)
const root = document.getElementById("root")
if (!root) fail("E202")

createRoot(root).render(
  <StrictMode>
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)}>
      <Screen />
    </MatomezuProvider>
  </StrictMode>,
)
