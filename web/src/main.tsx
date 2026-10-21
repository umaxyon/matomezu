// 画面の入口: ホスト（常駐から開いていればサーバー、そうでなければ見本のブックを持つメモリ）から残したブックと設定を読み、中の部品と見た目で app を作り、React の根に App を描く。変わったものはホストに残す

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { fail } from "./core/errors"
import { memoryHost } from "./host/memory"
import { persist } from "./host/persist"
import { startHost } from "./host/start"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "./plugins/ui"
import { SAMPLE_BOOKS } from "./sample-books"
import { createMatomezu } from "./store/create"
import { App } from "./ui/App"
import { MatomezuProvider } from "./ui/store-context"
import "./ui/skin.css"

const { host, loaded: saved } = await startHost(() => memoryHost(SAMPLE_BOOKS))
const store = createMatomezu({
  plugins: BUILTIN_UI,
  home: "master",
  savedBooks: saved.books,
  settings: saved.settings,
  lang: navigator.languages,
})
persist(store, host)
const root = document.getElementById("root")
if (!root) fail("E202")

createRoot(root).render(
  <StrictMode>
    <MatomezuProvider app={store} layout={DEFAULT_LAYOUT}>
      <App />
    </MatomezuProvider>
  </StrictMode>,
)
