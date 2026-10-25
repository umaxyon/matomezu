// 画面の入口: ホストクライアント（ホストから開いていればホストに頼むもの、そうでなければ見本のブックを持つメモリ）から残したブックと設定を読み、ビルトインプラグインと見た目で app を作り、React の根に App を描く。行ったアクションと外の変化はホストクライアントを通してやり取りする

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { fail } from "./core/errors"
import { memoryClient } from "./host-client/memory"
import { openClient } from "./host-client/open"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "./plugins/ui"
import { SAMPLE_BOOKS } from "./sample-books"
import { createMatomezu } from "./store/create"
import { App } from "./ui/App"
import { loadFonts } from "./ui/fonts"
import { MatomezuProvider } from "./ui/store-context"
import "./ui/skin.css"

loadFonts()
const { client, loaded: saved } = await openClient(() => memoryClient(SAMPLE_BOOKS))
const store = createMatomezu({
  plugins: BUILTIN_UI,
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
    <MatomezuProvider app={store} layout={DEFAULT_LAYOUT}>
      <App />
    </MatomezuProvider>
  </StrictMode>,
)
