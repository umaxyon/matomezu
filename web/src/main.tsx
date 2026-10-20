import { DEFAULT_LAYOUT } from "./plugins/base/ui"
// 画面の入口: 中の部品と見た目で app を作り、React の根に App を描く

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { fail } from "./core/errors"
import { detectLang } from "./core/i18n/i18n"
import { BUILTIN_UI } from "./plugins/ui"
import { SAMPLE_BOOKS } from "./sample-books"
import { createMatomezu } from "./store/create"
import { App } from "./ui/App"
import { MatomezuProvider } from "./ui/store-context"
import "./ui/skin.css"

const store = createMatomezu({ plugins: BUILTIN_UI, books: SAMPLE_BOOKS, lang: detectLang(navigator.languages) })
const root = document.getElementById("root")
if (!root) fail("E202")

createRoot(root).render(
  <StrictMode>
    <MatomezuProvider app={store} layout={DEFAULT_LAYOUT}>
      <App />
    </MatomezuProvider>
  </StrictMode>,
)
