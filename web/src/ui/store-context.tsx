// インスタンス（store・プラグインの見た目・配置）を画面の木に配る入れ物と、読む口・操作・表を取り出すフック
import { createContext, type ReactNode, useContext, useMemo } from "react"
import { useStore } from "zustand"
import { fail, matomezuError, problem } from "../core/errors"
import type { Warning } from "../core/warnings"
import type { Catalog, Plugin } from "../store/plugin"
import type { Actions, MatomezuInstance, MatomezuState } from "../store/store"
import { checkLayout, type LayoutDef, skipAbsent } from "./layout"
import { type AnyPluginUi, assembleUi, type UiCatalog } from "./plugin"

interface MatomezuContext {
  store: MatomezuInstance
  ui: UiCatalog
  layout: LayoutDef // 組み込まれていないプラグインの物を除いた配置
  warnings: readonly Warning[] // 配置の warning（除いた物）
}
const Context = createContext<MatomezuContext | null>(null)

// 画面に出す配置: 持ち主のプラグインが組み込まれていない物を除き（warning W010）、残りを確かめる。食い違いがあれば投げる（E210）
export function shownLayout(
  layout: LayoutDef,
  plugins: readonly Plugin[],
  ui: UiCatalog,
): { layout: LayoutDef; warnings: Warning[] } {
  const skipped = skipAbsent(layout, new Set(plugins.map(p => p.id)))
  const commands = new Set(plugins.flatMap(p => (p.commands ?? []).map(c => c.id)))
  const problems = checkLayout(skipped.layout, ui, commands)
  if (problems.length > 0) throw matomezuError(problem("E210", { layout: layout.id, count: problems.length }), problems)
  return skipped
}

// 見た目を結んだプラグインだけで作ったインスタンスを、配置と一緒に置く（結んでいないプラグインがあれば型の誤り）。
// 配置は渡すたびに確かめ（知らないウィジェット・置けないスロット・インスタンスに無いコマンド）、変えればその場で組み直す。
// 持ち主のプラグインが組み込まれていない物は、確かめる前に除いて warning にする
export function MatomezuProvider({
  instance,
  layout,
  children,
}: {
  instance: MatomezuInstance<readonly AnyPluginUi[]>
  layout: LayoutDef
  children: ReactNode
}) {
  const ui = useMemo(() => assembleUi(instance.plugins), [instance])
  const value = useMemo(() => {
    const shown = shownLayout(layout, instance.plugins, ui)
    return { store: instance, ui, layout: shown.layout, warnings: shown.warnings }
  }, [instance, ui, layout])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

function useMatomezuContext(): MatomezuContext {
  return useContext(Context) ?? fail("E201")
}

// 選んだ値が変わったときだけ描き直す。selector は新しいオブジェクトを作らず、状態の中の値をそのまま返す
export function useMatomezuState<T>(selector: (s: MatomezuState) => T): T {
  return useStore(useMatomezuContext().store.state, selector)
}

export function useActions(): Actions {
  return useMatomezuContext().store.actions
}

// インスタンス（機能台帳と組み立てで決まる値は、作った後は変わらない）
export function useInstance(): MatomezuInstance {
  return useMatomezuContext().store
}

// 配置の warning（持ち主のプラグインが組み込まれていないので除いた物。W010）
export function useLayoutWarnings(): readonly Warning[] {
  return useMatomezuContext().warnings
}

// インスタンスが持つ機能台帳（core 台帳と store 台帳）
export function useCatalog(): Catalog {
  return useMatomezuContext().store.catalog
}

// インスタンスの見た目の表（ブックのタイプ・アイテム・ダイアログのビュー・ウィジェット・コマンドのアイコン）
export function useUiCatalog(): UiCatalog {
  return useMatomezuContext().ui
}

export function useLayout(): LayoutDef {
  return useMatomezuContext().layout
}
