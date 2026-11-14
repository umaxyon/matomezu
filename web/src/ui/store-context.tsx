// インスタンス（store・プラグインの見た目・UI マッピング）を画面の木に配る入れ物と、読む口・操作・表を取り出すフック
import { createContext, type ReactNode, useContext, useMemo, useRef } from "react"
import { useStore } from "zustand"
import { fail, matomezuError, problem } from "../core/errors"
import { disabledPluginsOf } from "../core/settings"
import type { Warning } from "../core/warnings"
import { type Catalog, isBuiltin, type Plugin } from "../store/plugin"
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
  disabled?: ReadonlySet<string>,
): { layout: LayoutDef; warnings: Warning[] } {
  const skipped = skipAbsent(layout, new Set(plugins.map(p => p.id)), disabled)
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
// warnings は、UI マッピングを作るときに見つかった warning（置かなかったウィジェット・外した追加プラグインなど）で、除いた物の warning と一緒に画面の warning にする
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
  // 利用者が無効にしたプラグイン（role が disabled-plugins の設定）の物は、組み込んだまま UI マッピングに置かない。warning は出さない
  const settings = useStore(instance.state, s => s.settings)
  const nowDisabled = useMemo(
    () =>
      disabledPluginsOf(instance.catalog.core, settings, new Set(instance.plugins.filter(isBuiltin).map(p => p.id))),
    [instance, settings],
  )
  // 設定のどれが変わっても新しい集合ができるので、中身が同じなら前の集合を使う（UI マッピングを組み直して画面全体を描き直さない）
  const disabledRef = useRef(nowDisabled)
  if (!sameIds(disabledRef.current, nowDisabled)) disabledRef.current = nowDisabled
  const disabled = disabledRef.current
  const value = useMemo(() => {
    const shown = shownLayout(layout, instance.plugins, ui, disabled)
    return { store: instance, ui, layout: shown.layout, warnings: [...warnings, ...shown.warnings] }
  }, [instance, ui, layout, warnings, disabled])
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

export function useActions(): Actions {
  return useMatomezuContext().store.actions
}

// インスタンス（機能台帳と台帳アセンブルで決まる値は、作った後は変わらない）
export function useInstance(): MatomezuInstance {
  return useMatomezuContext().store
}

const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every(id => b.has(id))

const NO_WARNINGS: readonly Warning[] = []

// 画面の warning（UI マッピングを作るときに見つかった物と、持ち主のプラグインが組み込まれていないので UI マッピングで除いた物）
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
