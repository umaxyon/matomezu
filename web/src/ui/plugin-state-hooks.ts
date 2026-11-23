// プラグインの見た目が使う、プラグイン状態のフック（matomezu/ui）: 宣言の値を、描いている場所（ui/scope.tsx）から決まる場所で読み書きする。
// ステージごとの宣言は向け先のステージ、スクリーンごとの宣言は描いているスクリーン

import { useCallback } from "react"
import {
  type PluginStateDef,
  type PluginStateScope,
  type StateChange,
  type StateOf,
  type StateRead,
  stateRead,
  storedOf,
} from "../core/def/plugin-state"
import { NO_STAGE } from "../core/stage"
import { ownedPluginState, type PluginPlace, placeOf } from "../store/plugin-state"
import {
  type Owner,
  usePluginStateAt,
  useReadPluginStateAt,
  useResetPluginStateAt,
  useSetPluginStateAt,
  useUpdatePluginStateAt,
} from "./at-hooks"
import { useScope, useStageId } from "./scope"
import { useScreenIdHere } from "./screen-context"
import { useInstance } from "./store-context"

// 値のある場所: ステージごとの宣言は向け先のステージ、スクリーンごとの宣言は描いているスクリーン（どちらも呼び出しには渡さなくてよい。描いている場所から決まる）。
// 向け先がステージでない所では、ステージごとの宣言の値は無く、置いても何も変わらない。向け先が無い所（ステージの外で見るだけに描くページの中）では、どの範囲の値も置けない（読むことはできる）。
// スクリーンごとの宣言は、スクリーンの id を渡して名指せる（スクリーンを並べるスクリーンアレンジメントのウィジェットが、並べる 1 枚ごとの値を読み書きするとき）
type At<Sc extends PluginStateScope> = Sc extends "screen" ? [screen?: string] : []

// 宣言の範囲 scope の値の場所（場所が無ければ null）。given は、呼び出しに渡されたスクリーンの id
function usePluginPlace(
  scope: PluginStateScope,
  use: "read" | "write" = "read",
): (given: string | undefined) => PluginPlace | null {
  const here = useScope()
  const closed = use === "write" && here.actsOn.kind === "none" // 向け先が無い所からは、どの範囲の値も書かない
  const id = useStageId()
  const stage = id === NO_STAGE ? null : id
  const screen = useScreenIdHere() ?? (here.actsOn.kind === "screen" ? here.actsOn.screen : null)
  return useCallback(
    given => (closed ? null : placeOf(scope, { stage, screen: given ?? screen })),
    [scope, stage, screen, closed],
  )
}

// プラグイン状態 def の今の値（無ければ、既定を持つ宣言は既定、持たない宣言は NO_STATE）。自分の kit を渡し、自分の宣言だけを読む（ほかのプラグインの宣言は E125）。置き直すたびに描き直す
export function usePluginState<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
  ...at: At<D["scope"]>
): StateRead<D> {
  return usePluginStateAt(kit, def, usePluginPlace(def.scope)(at[0]))
}

// プラグイン状態 def を、描き直さずに読む関数（置いた側が、前に置いた値と比べるときなど）
export function useReadPluginState<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (...at: At<D["scope"]>) => StateRead<D> {
  const read = useReadPluginStateAt(kit, def)
  const placeFor = usePluginPlace(def.scope)
  return useCallback(
    (...given: readonly (string | undefined)[]) => {
      const at = placeFor(given[0])
      return at === null ? stateRead(def, undefined) : read(at)
    },
    [read, placeFor, def],
  )
}

// プラグイン状態 def の値を変える関数（引数が新しい値。消すのは useResetPluginState。場所が無ければ置かない。画面の場所に入れる宣言の形に合わなければ E123）
export function useSetPluginState<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (...args: [...At<D["scope"]>, StateOf<D>] | [StateOf<D>]) => void {
  const set = useSetPluginStateAt(kit, def)
  const placeFor = usePluginPlace(def.scope, "write")
  const named = def.scope === "screen"
  return useCallback(
    (...args: unknown[]) => {
      const at = placeFor(named && args.length === 2 ? (args[0] as string) : undefined)
      if (at !== null) set(at, args[args.length - 1] as StateOf<D>)
    },
    [set, placeFor, named],
  )
}

// プラグイン状態 def の値を消す関数（既定を持つ宣言は既定を、持たない宣言は NO_STATE を読むようになる。スクリーンごとの宣言は、スクリーンの id を渡して名指せる。場所が無ければ何もしない）
export function useResetPluginState<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (...at: At<D["scope"]>) => void {
  const reset = useResetPluginStateAt(kit, def)
  const placeFor = usePluginPlace(def.scope, "write")
  return useCallback(
    (...given: readonly (string | undefined)[]) => {
      const at = placeFor(given[0])
      if (at !== null) reset(at)
    },
    [reset, placeFor],
  )
}

// ほかのプラグインの宣言に値を入れる関数（宣言の id と値。画面の場所に入れる宣言＝address を持つ宣言だけが受ける。形は土台が宣言の形で確かめる）。入れたら true、
// 宣言が無い・address が無い・形に合わない値・場所の無い範囲は何もせず false。
// スクリーンごとの宣言は、at.screenDef（書き先のスクリーンの定義の id）の開いているスクリーンの値（複数なら最後にカレントにした 1 枚。開いていなければ false）。
// screenDef を渡さなければ、このビューがいるスクリーンの値（スクリーンの外の物は false。窓のカレントスクリーンには落とさない）。
// ステージごとの宣言は、向け先のステージの値（向け先がステージでなければ false）。
// 同じ値なら何も変わらず、ブラウザの履歴に積まない。ほかのプラグインのコードは読まず、id の文字と値だけで頼む（自分の宣言は useSetPluginState）
export function useSetPluginStateById(): (id: string, value: unknown, at?: { screenDef?: string }) => boolean {
  const { setPluginStateById } = useInstance()
  const here = useScreenIdHere()
  const stage = useStageId()
  const nowhere = useScope().actsOn.kind === "none"
  return useCallback(
    (id, value, at) =>
      !nowhere &&
      setPluginStateById(id, value, {
        ...(here !== undefined ? { screen: here } : {}),
        ...(stage !== NO_STAGE ? { stage } : {}),
        ...(at?.screenDef !== undefined ? { screenDef: at.screenDef } : {}),
      }),
    [setPluginStateById, here, stage, nowhere],
  )
}

// 複数のプラグイン状態の値を、1 回で書く関数（途中の、片方だけ変わった状態を知らせない）。自分の kit を渡し、自分の宣言だけを書く。
// 変え方は [宣言, 新しい値（NO_STATE なら消す）] の並び（ステージごとの宣言は向け先のステージ、スクリーンごとの宣言は描いているスクリーンの値。その場所が無ければ、その変え方は捨てる）
export function useSetPluginStates(
  kit: Owner,
): (changes: readonly (readonly [def: PluginStateDef<unknown>, value: unknown])[]) => void {
  const { setPluginStates } = useInstance()
  const id = kit.id
  const here = useScope()
  const stageId = useStageId()
  const stage = stageId === NO_STAGE ? null : stageId
  const screen = useScreenIdHere() ?? (here.actsOn.kind === "screen" ? here.actsOn.screen : null)
  const nowhere = here.actsOn.kind === "none"
  return useCallback(
    changes =>
      !nowhere &&
      setPluginStates(
        changes.flatMap(([def, value]) => {
          const at = placeOf(def.scope, { stage, screen })
          return at === null ? [] : [[ownedPluginState(id, def).id, at, storedOf(value)] as const]
        }),
      ),
    [setPluginStates, id, stage, screen, nowhere],
  )
}

// プラグイン状態 def の値を、今の値から change が返す値にする関数（引数が change。NO_STATE を返せば消す。場所が無ければ何もしない）
export function useUpdatePluginState<D extends PluginStateDef<unknown>>(
  kit: Owner,
  def: D,
): (
  ...args: [...At<D["scope"]>, (now: StateRead<D>) => StateChange<D>] | [(now: StateRead<D>) => StateChange<D>]
) => void {
  const update = useUpdatePluginStateAt(kit, def)
  const placeFor = usePluginPlace(def.scope, "write")
  const named = def.scope === "screen"
  return useCallback(
    (...args: unknown[]) => {
      const at = placeFor(named && args.length === 2 ? (args[0] as string) : undefined)
      if (at !== null) update(at, args[args.length - 1] as (now: StateRead<D>) => StateChange<D>)
    },
    [update, placeFor, named],
  )
}
