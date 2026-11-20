// インスタンス（store・プラグインの見た目・UI マッピング）を画面の木に配る入れ物と、読む口・操作・表を取り出すフック
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
  layout: LayoutDef // 組み込まれていないプラグインの物を除いた UI マッピング
  warnings: readonly Warning[] // 画面の warning（UI マッピングを作るときに見つかった物と、UI マッピングで除いた物）
}
const Context = createContext<MatomezuContext | null>(null)

// 画面に出す UI マッピング: 持ち主のプラグインが組み込まれていない物を除き（warning W010）、残りを確かめる。食い違いがあれば投げる（E210）
export function shownLayout(
  layout: LayoutDef,
  plugins: readonly Plugin[],
  ui: UiCatalog,
): { layout: LayoutDef; warnings: Warning[] } {
  const skipped = skipAbsent(layout, new Set(plugins.map(p => p.id)))
  const commands = new Set(plugins.flatMap(p => (p.commands ?? []).map(c => c.id)))
  const named = {
    screens: new Set(plugins.flatMap(p => (p.screens ?? []).map(s => s.id))),
    screenArrangements: new Set(plugins.flatMap(p => (p.screenArrangements ?? []).map(s => s.id))),
  }
  const problems = checkLayout(skipped.layout, ui, commands, named)
  if (problems.length > 0) throw matomezuError(problem("E210", { layout: layout.id, count: problems.length }), problems)
  return skipped
}

// 見た目を結んだプラグインだけで作ったインスタンスを、UI マッピングと一緒に置く（結んでいないプラグインがあれば型の誤り）。
// UI マッピングは渡すたびに確かめ（知らないウィジェット・置けないスロット・インスタンスに無いコマンド）、変えればその場で組み直す。
// 持ち主のプラグインが組み込まれていない物は、確かめる前に除いて warning にする。
// warnings は、UI マッピングを作るときに見つかった warning（置かなかったウィジェットなど）で、除いた物の warning と一緒に画面の warning にする
export function MatomezuProvider({
  instance,
  layout,
  warnings = NO_WARNINGS,
  children,
}: {
  instance: MatomezuInstance<readonly AnyPluginUi[]>
  layout: LayoutDef
  warnings?: readonly Warning[]
  children: ReactNode
}) {
  const ui = useMemo(() => assembleUi(instance.plugins), [instance])
  const value = useMemo(() => {
    const shown = shownLayout(layout, instance.plugins, ui)
    return { store: instance, ui, layout: shown.layout, warnings: [...warnings, ...shown.warnings] }
  }, [instance, ui, layout, warnings])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

function useMatomezuContext(): MatomezuContext {
  return useContext(Context) ?? fail("E201")
}

// 選んだ値が変わったときだけ描き直す。selector は新しいオブジェクトを作らず、状態の中の値をそのまま返す
export function useMatomezuState<T>(selector: (s: MatomezuState) => T): T {
  return useStore(useMatomezuContext().store.state, selector)
}

// インスタンスのコントロールセンターの定義の id（一覧と設定のアクションを使えるかを決める）
export function useControlCenter(): string | null {
  return useMatomezuContext().store.controlCenter
}

// 今の状態を読む関数（描き直さない。イベントや effect の中で、その時点の値を読むのに使う）
export function useReadState(): () => MatomezuState {
  return useMatomezuContext().store.state.getState
}

// 画面の操作（store が持つ素の形。場所に向ける操作は、場所を第 1 引数に取る）。土台と base の骨組みだけが使う。
// プラグインのビューは、描いている場所に向けた形（ui/view-hooks.ts の useActions）を使う
export function useStoreActions(): Actions {
  return useMatomezuContext().store.actions
}

// インスタンス（機能台帳と台帳アセンブルで決まる値は、作った後は変わらない）
export function useInstance(): MatomezuInstance {
  return useMatomezuContext().store
}

const NO_WARNINGS: readonly Warning[] = []

// 画面の warning（UI マッピングを作るときに見つかった物と、持ち主のプラグインが組み込まれていないので UI マッピングで除いた物）
export function useLayoutWarnings(): readonly Warning[] {
  return useMatomezuContext().warnings
}

// インスタンスが持つ機能台帳（core 台帳と store 台帳）
export function useCatalog(): Catalog {
  return useMatomezuContext().store.catalog
}

// インスタンスの見た目の表（ページのタイプ・アイテム・ダイアログのビュー・ウィジェット・コマンドのアイコン）
export function useUiCatalog(): UiCatalog {
  return useMatomezuContext().ui
}

export function useLayout(): LayoutDef {
  return useMatomezuContext().layout
}
