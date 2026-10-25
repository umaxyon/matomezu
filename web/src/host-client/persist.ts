// インスタンスの状態の変わり目を残す先に渡す: 変わったブックと設定を渡す（画面の状態は渡さない）。止める関数を返す
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { AppStore } from "../store/store"

export interface Keeper {
  saveBook(book: Book): void
  saveSettings(settings: Settings): void
}

export function persist(app: AppStore, keeper: Keeper): () => void {
  return app.state.subscribe((state, prev) => {
    if (state.books !== prev.books) {
      for (const book of Object.values(state.books)) if (prev.books[book.id] !== book) keeper.saveBook(book)
    }
    if (state.settings !== prev.settings) keeper.saveSettings(state.settings)
  })
}
