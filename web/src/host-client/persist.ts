// インスタンスの状態の変わり目を残す先に渡す: 変わったブック（ゴミ箱のブックも）・無くなったブックと設定を渡す（画面の状態は渡さない）。止める関数を返す
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { MatomezuInstance } from "../store/store"

export interface Keeper {
  saveBook(book: Book): void
  removeBook(id: string): void // ゴミ箱から消したブック
  saveSettings(settings: Settings): void
}

export function persist(instance: MatomezuInstance, keeper: Keeper): () => void {
  return instance.state.subscribe((state, prev) => {
    if (state.books !== prev.books || state.trash !== prev.trash) {
      const before = { ...prev.books, ...prev.trash }
      for (const book of [...Object.values(state.books), ...Object.values(state.trash)])
        if (before[book.id] !== book) keeper.saveBook(book)
      for (const id of Object.keys(before)) if (!(id in state.books) && !(id in state.trash)) keeper.removeBook(id)
    }
    if (state.settings !== prev.settings) keeper.saveSettings(state.settings)
  })
}
