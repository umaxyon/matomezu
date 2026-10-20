// store を画面の木に配る入れ物と、読む口・操作を取り出すフック

import { createContext, type ReactNode, useContext } from "react"
import { useStore } from "zustand"
import { fail } from "../core/errors"
import type { Actions, AppState, AppStore } from "../store/store"

const StoreContext = createContext<AppStore | null>(null)

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

function useAppStore(): AppStore {
  const store = useContext(StoreContext)
  if (!store) return fail("E201")
  return store
}

// 選んだ値が変わったときだけ描き直す。selector は新しいオブジェクトを作らず、状態の中の値をそのまま返す
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppStore().state, selector)
}

export function useActions(): Actions {
  return useAppStore().actions
}
