// app の状態の変わり目をホストに渡す: 変わったブックと設定を残すように頼む（画面の状態は渡さない）。止める関数を返す
import type { AppStore } from "../store/store"
import type { Host } from "./host"

export function persist(app: AppStore, host: Host): () => void {
  return app.state.subscribe((state, prev) => {
    if (state.books !== prev.books) {
      for (const book of Object.values(state.books)) if (prev.books[book.id] !== book) host.saveBook(book)
    }
    if (state.settings !== prev.settings) host.saveSettings(state.settings)
  })
}
