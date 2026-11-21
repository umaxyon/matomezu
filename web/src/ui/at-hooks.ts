// 場所を名指すフック: ステージ・スクリーンの id を引数に取る。土台と、base の骨組み（ステージを並べる所・サイドパネルの入れ物・ダイアログやメニューの置き場など、
// 自分の置かれた所でないステージを扱う物）だけが使う。プラグイン API には出さない（プラグインのビューは、描いている場所から引く ui/view-hooks.ts・ui/plugin-state-hooks.ts などのフックを使う）
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import type { PluginStateDef } from "../core/def/plugin-state"
import { stageIn, workspaceOf } from "../core/window"
import { type StageView, stageView, toolOf } from "../core/workspace"
import type { PluginKit } from "../store/kit"
import { ownedPluginState, type PluginPlace, placeAt, pluginValueOf } from "../store/plugin-state"
import { useCatalog, useInstance, useMatomezuState, useReadState } from "./store-context"

// プラグイン状態の持ち主（プラグインの kit。kit の id が頭の宣言だけを読み書きする。id だけの物は受けない）
// biome-ignore lint/suspicious/noExplicitAny: どのプラグインの kit も受ける（文言の表の型は見ない）
export type Owner = PluginKit<string, any>

// ステージ stage（読むだけ。null か、無いステージなら null）。紙をずらしただけでは描き直さない
export function useStageAt(stage: string | null): StageView | null {
  const catalog = useCatalog().core
  const found = useMatomezuState(
    useShallow(s => {
      const st = stage === null ? undefined : stageIn(s.window, stage)
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
  const tool = useMatomezuState(s => (stage === null ? null : toolOf(catalog, workspaceOf(s.window, stage), stage, s)))
  return useMemo(() => (found ? stageView(catalog, found, tool) : null), [catalog, found, tool])
}

// プラグイン状態 def の、場所 at（null なら場所が無い）の今の値。置き直すたびに描き直す
export function usePluginStateAt<S>(kit: Owner, def: PluginStateDef<S>, at: PluginPlace | null): S | undefined {
  const own = ownedPluginState(kit.id, def)
  return useMatomezuState(s => (at === null ? undefined : pluginValueOf(s.pluginValues, at, own)))
}

// プラグイン状態 def を、描き直さずに読む関数（引数は場所）
export function useReadPluginStateAt<S>(kit: Owner, def: PluginStateDef<S>): (at: PluginPlace) => S | undefined {
  const read = useReadState()
  const own = ownedPluginState(kit.id, def)
  return useCallback((at: PluginPlace) => pluginValueOf(read().pluginValues, at, own), [read, own])
}

// プラグイン状態 def の、場所 at の値を変える関数（value が undefined なら消す。窓の範囲の宣言は at を見ない）
export function useSetPluginStateAt<S>(
  kit: Owner,
  def: PluginStateDef<S>,
): (at: PluginPlace, value: S | undefined) => void {
  const { setPluginState } = useInstance()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (at: PluginPlace, value: S | undefined) => setPluginState(own.id, placeAt(own.scope, at) ?? at, value),
    [setPluginState, own],
  )
}

// 複数のプラグイン状態の値を、1 回で書く関数。変え方は [宣言, 場所, 新しい値] の並び
export function useSetPluginStatesAt(
  kit: Owner,
): (changes: readonly (readonly [def: PluginStateDef<unknown>, at: PluginPlace, value: unknown])[]) => void {
  const { setPluginStates } = useInstance()
  const id = kit.id
  return useCallback(
    changes => setPluginStates(changes.map(([def, at, value]) => [ownedPluginState(id, def).id, at, value] as const)),
    [setPluginStates, id],
  )
}

// プラグイン状態 def の、場所 at の値を、今の値から change が返す値にする関数
export function useUpdatePluginStateAt<S>(
  kit: Owner,
  def: PluginStateDef<S>,
): (at: PluginPlace, change: (now: S | undefined) => S | undefined) => void {
  const { setPluginState } = useInstance()
  const read = useReadState()
  const own = ownedPluginState(kit.id, def)
  return useCallback(
    (at: PluginPlace, change: (now: S | undefined) => S | undefined) => {
      const place = placeAt(own.scope, at) ?? at // 範囲に合わない場所は、そのまま渡して E124 で断る
      setPluginState(own.id, place, change(pluginValueOf(read().pluginValues, place, own)))
    },
    [setPluginState, read, own],
  )
}
