// app（store と、プラグインの見た目）を画面の木に配る入れ物と、読む口・操作・表を取り出すフック
import { createContext, type ReactNode, useContext, useMemo } from "react"
import { useStore } from "zustand"
import { fail } from "../core/errors"
import type { Registry } from "../core/registry"
import type { AppDefs } from "../store/plugin"
import type { Actions, AppState, AppStore } from "../store/store"
import { type AnyPluginUi, assembleUi, type UiDefs } from "./plugin"

interface AppContext {
  store: AppStore
  ui: UiDefs
}
const Context = createContext<AppContext | null>(null)

// 見た目を結んだプラグインだけで作った app を置く（結んでいないプラグインがあれば型の誤り）
export function MatomezuProvider({ app, children }: { app: AppStore<readonly AnyPluginUi[]>; children: ReactNode }) {
  const value = useMemo(() => ({ store: app, ui: assembleUi(app.plugins) }), [app])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

function useAppContext(): AppContext {
  return useContext(Context) ?? fail("E201")
}

// 選んだ値が変わったときだけ描き直す。selector は新しいオブジェクトを作らず、状態の中の値をそのまま返す
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppContext().store.state, selector)
}

export function useActions(): Actions {
  return useAppContext().store.actions
}

// app が使う定義の表と登録表（作った後は変わらない）
export function useDefs(): AppDefs {
  return useAppContext().store
}

export function useRegistry(): Registry {
  return useAppContext().store.registry
}

// app の見た目の表（ブックのタイプ・アイテム・ダイアログのビュー）
export function useUi(): UiDefs {
  return useAppContext().ui
}
