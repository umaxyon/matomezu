// app（store・プラグインの見た目・配置）を画面の木に配る入れ物と、読む口・操作・表を取り出すフック
import { createContext, type ReactNode, useContext, useMemo } from "react"
import { useStore } from "zustand"
import { fail, matomezuError, problem } from "../core/errors"
import type { Registry } from "../core/registry"
import type { AppDefs } from "../store/plugin"
import type { Actions, AppState, AppStore } from "../store/store"
import { checkLayout, type LayoutDef } from "./layout"
import { type AnyPluginUi, assembleUi, type UiDefs } from "./plugin"

interface AppContext {
  store: AppStore
  ui: UiDefs
  layout: LayoutDef
}
const Context = createContext<AppContext | null>(null)

// 見た目を結んだプラグインだけで作った app を、配置と一緒に置く（結んでいないプラグインがあれば型の誤り）。
// 配置は渡すたびに確かめ（知らないウィジェット・置けないスロット・app に無いコマンド）、変えればその場で組み直す
export function MatomezuProvider({
  app,
  layout,
  children,
}: {
  app: AppStore<readonly AnyPluginUi[]>
  layout: LayoutDef
  children: ReactNode
}) {
  const ui = useMemo(() => assembleUi(app.plugins), [app])
  const value = useMemo(() => {
    const problems = checkLayout(layout, ui, new Set(app.commands.keys()))
    if (problems.length > 0)
      throw matomezuError(problem("E210", { layout: layout.id, count: problems.length }), problems)
    return { store: app, ui, layout }
  }, [app, ui, layout])
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

// app の見た目の表（ブックのタイプ・アイテム・ダイアログのビュー・ウィジェット・コマンドのアイコン）
export function useUi(): UiDefs {
  return useAppContext().ui
}

export function useLayout(): LayoutDef {
  return useAppContext().layout
}
