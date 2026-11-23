// 場所を名指すフック: ステージ・スクリーンの id を引数に取る。土台と、base の骨組み（ステージを並べる所・サイドパネルの入れ物・ダイアログやメニューの置き場など、
// 自分の置かれた所でないステージを扱う物）だけが使う。プラグイン API には出さない（プラグインのビューは、描いている場所から引く ui/view-hooks.ts・ui/plugin-state-hooks.ts などのフックを使う）
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import {
  type PluginStateDef,
  type StateChange,
  type StateOf,
  type StateRead,
  stateRead,
  storedOf,
} from "../core/def/plugin-state"
import { NO_STAGE } from "../core/stage"
import { stageIn, workspaceOf } from "../core/window"
import { type StageView, stageView, toolOf } from "../core/workspace"
import type { PluginKit } from "../store/kit"
import { ownedPluginState, type PluginPlace, placeAt, pluginValueOf } from "../store/plugin-state"
import { useCatalog, useInstance, useMatomezuState, useReadState } from "./store-context"

// プラグイン状態の持ち主（プラグインの kit。kit の id が頭の宣言だけを読み書きする。id だけの物は受けない）
// biome-ignore lint/suspicious/noExplicitAny: どのプラグインの kit も受ける（文言の表の型は見ない）
export type Owner = PluginKit<string, any>

// ステージ stage（読むだけ。NO_STAGE か、無いステージなら NO_STAGE）。紙をずらしただけでは描き直さない
export function useStageAt(stage: string): StageView | typeof NO_STAGE {
  const catalog = useCatalog().core
  const found = useMatomezuState(
    useShallow(s => {
      const st = stage === NO_STAGE ? undefined : stageIn(s.window, stage)
      return st
        ? {
            id: st.id,
            opened: st.opened,
            zoom: st.zoom,
            selection: st.selection,
            editing: st.editing,
            placing: st.placing,
            edits: st.edits,
            mode: st.mode,
          }
        : null
    }),
  )
  const tool = useMatomezuState(s => (found ? toolOf(catalog, workspaceOf(s.window, found.id), found.id, s) : null))
  return useMemo(() => (found ? stageView(catalog, found, tool) : NO_STAGE), [catalog, found, tool])
}

// プラグイン状態 def の、場所 at（null なら場所が無い。値が無いのと同じに読む）の今の値（StateRead）。置き直すたびに描き直す
export function usePluginStateAt<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
  at: PluginPlace | null,
): StateRead<D> {
  const own = ownedPluginState(kit.id, def)
  return useMatomezuState(s => stateRead(def, at === null ? undefined : pluginValueOf(s.pluginValues, at, own)))
}

// プラグイン状態 def を、描き直さずに読む関数（引数は場所）
export function useReadPluginStateAt<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (at: PluginPlace) => StateRead<D> {
  const read = useReadState()
  const own = ownedPluginState(kit.id, def)
  return useCallback((at: PluginPlace) => stateRead(def, pluginValueOf(read().pluginValues, at, own)), [read, own, def])
}

// プラグイン状態 def の、場所 at の値を変える関数（窓の範囲の宣言は at を見ない）
export function useSetPluginStateAt<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (at: PluginPlace, value: StateOf<D>) => void {
  const { setPluginState } = useInstance()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (at: PluginPlace, value: StateOf<D>) => setPluginState(own.id, placeAt(own.scope, at) ?? at, value),
    [setPluginState, own],
  )
}

// プラグイン状態 def の、場所 at の値を消す関数（既定を持つ宣言は既定を、持たない宣言は NO_STATE を読むようになる。窓の範囲の宣言は at を見ない）
export function useResetPluginStateAt(kit: Owner, def: PluginStateDef<unknown>): (at: PluginPlace) => void {
  const { setPluginState } = useInstance()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (at: PluginPlace) => setPluginState(own.id, placeAt(own.scope, at) ?? at, undefined),
    [setPluginState, own],
  )
}

// 複数のプラグイン状態の値を、1 回で書く関数。変え方は [宣言, 場所, 新しい値（NO_STATE なら消す）] の並び
export function useSetPluginStatesAt(
  kit: Owner,
): (changes: readonly (readonly [def: PluginStateDef<unknown>, at: PluginPlace, value: unknown])[]) => void {
  const { setPluginStates } = useInstance()
  const id = kit.id
  return useCallback(
    changes =>
      setPluginStates(changes.map(([def, at, value]) => [ownedPluginState(id, def).id, at, storedOf(value)] as const)),
    [setPluginStates, id],
  )
}

// プラグイン状態 def の、場所 at の値を、今の値から change が返す値にする関数
export function useUpdatePluginStateAt<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (at: PluginPlace, change: (now: StateRead<D>) => StateChange<D>) => void {
  const { setPluginState } = useInstance()
  const read = useReadState()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (at: PluginPlace, change: (now: StateRead<D>) => StateChange<D>) => {
      const place = placeAt(own.scope, at) ?? at // 範囲に合わない場所は、そのまま渡して E124 で断る
      setPluginState(own.id, place, storedOf(change(stateRead(def, pluginValueOf(read().pluginValues, place, own)))))
    },
    [setPluginState, read, own, def],
  )
}
