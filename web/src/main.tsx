// 画面の入口: store を作り、React の根に App を描く
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createAppStore } from "./store/store"
import { App } from "./ui/App"
import { StoreProvider } from "./ui/store-context"
import "./ui/skin.css"

const store = createAppStore()
const root = document.getElementById("root")
if (!root) throw new Error("#root is missing")

createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
)
