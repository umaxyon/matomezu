// 画面の入口: ホストクライアント（ホストから開いていればホストに頼むもの、そうでなければ見本のブックを持つメモリ）から残したブックと設定を読み、ビルトインプラグインと見た目でインスタンスを作り、React の根に App を描く。行ったアクションと外の変化はホストクライアントを通してやり取りする。
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
import { App } from "./ui/App"
import { loadFonts } from "./ui/fonts"
import type { AnyPluginUi } from "./ui/plugin"
import { MatomezuProvider } from "./ui/store-context"
import "./ui/skin.css"

loadFonts()
;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = UI_MODULES
const { client, loaded: saved } = await openClient(() => memoryClient(SAMPLE_BOOKS))
// 追加プラグインは機能台帳の型の側に入らないので、型では確かめず、組み立てで確かめる（partial）
const store = createMatomezu({
  plugins: [...BUILTIN_UI, ...(saved.plugins as AnyPluginUi[])],
  partial: true,
  home: "master",
  savedBooks: saved.books,
  settings: saved.settings,
  lang: navigator.languages,
  observe: done => client.observe(done),
})
client.connect(store)
const root = document.getElementById("root")
if (!root) fail("E202")

createRoot(root).render(
  <StrictMode>
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <App />
    </MatomezuProvider>
  </StrictMode>,
)
