// プラグイン状態（定義は core/def/plugin-state.ts）の値の置き場と、画面の場所との行き来。
// 値は pluginValues に持つ（窓の外観枠は id → 値、ステージは ステージの id → id → 値）。画面の場所に入れる宣言（address が none でない）の値は、置くときも場所から戻すときも
// 宣言の形（schema）で読み、合わない値と宣言の無い id は無いものとして落とす。入れない宣言（none）は場所に出さず、場所から来ても読まず、戻る・進むでも残す

import type { PluginStateDef, PluginStateScope } from "../core/def/plugin-state"
import { fail } from "../core/errors"
import { isOwnedBy } from "../core/names"
import { sameData } from "../core/same"
import { stageIn, type WindowState } from "../core/window"

export interface PluginValues {
  readonly window: Readonly<Record<string, unknown>>
  readonly stages: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  readonly screens: Readonly<Record<string, Readonly<Record<string, unknown>>>> // 開いているスクリーンの id → id → 値
}

export const NO_PLUGIN_STATES: PluginValues = { window: {}, stages: {}, screens: {} }

// 宣言の表（id → 定義）
export type PluginStateDefs = ReadonlyMap<string, PluginStateDef>

// 値の組 values のうち、scope の宣言の、画面の場所に入れる物だけの組（画面の場所へ出す形）
export function placedOf(
  defs: PluginStateDefs,
  scope: PluginStateScope,
  values: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(values ?? {})) {
    const def = defs.get(id)
    if (def?.scope === scope && def.address !== "none" && value !== undefined) out[id] = value
  }
  return out
}

// 場所の値の組 raw のうち、scope の宣言があり、画面の場所に入れる宣言で、形に合う値だけの組（宣言の無い id・入れない宣言の id・合わない値は落とす）
export function readPlaced(
  defs: PluginStateDefs,
  scope: PluginStateScope,
  raw: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const read: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(raw ?? {})) {
    const def = defs.get(id)
    if (def?.scope !== scope || def.address === "none" || !def.schema) continue
    const parsed = def.schema.safeParse(value)
    if (parsed.success && parsed.data !== undefined) read[id] = parsed.data
  }
  return read
}

// 現在の値の組 now のうち、scope の宣言の、画面の場所に入れない物だけの組（場所を当てはめても残す）
export function keptOutside(
  defs: PluginStateDefs,
  scope: PluginStateScope,
  now: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(now ?? {})) {
    const def = defs.get(id)
    if (def?.scope === scope && def.address === "none") kept[id] = value
  }
  return kept
}

// 値の組 values の id を value にした新しい組（undefined なら消す）
export function withPluginState(
  values: Readonly<Record<string, unknown>> | undefined,
  id: string,
  value: unknown,
): Record<string, unknown> {
  const { [id]: _, ...rest } = values ?? {}
  return value === undefined ? rest : { ...rest, [id]: value }
}

// 宣言 def が持ち主 owner（プラグインの id）の物か確かめて、そのまま返す（ほかのプラグインの宣言は E125）
export function ownedPluginState<S>(owner: string, def: PluginStateDef<S>): PluginStateDef<S> {
  return isOwnedBy(owner, def.id) ? def : fail("E125", { id: def.id, owner })
}

// プラグイン状態の値の場所: 窓の範囲の宣言は WINDOW_PLACE、ステージごとの宣言はステージの id、スクリーンごとの宣言はスクリーンの id
export const WINDOW_PLACE: { readonly scope: "window" } = Object.freeze({ scope: "window" })
export type PluginPlace = string | typeof WINDOW_PLACE

// 宣言の範囲 scope の値の場所。呼び手が決めたステージ here.stage とスクリーン here.screen から引く（その範囲の場所が無ければ null）
export function placeOf(scope: PluginStateScope, here: { readonly stage: string; readonly screen: string }): PluginPlace
export function placeOf(
  scope: PluginStateScope,
  here: { readonly stage?: string | null; readonly screen?: string | null },
): PluginPlace | null
export function placeOf(
  scope: PluginStateScope,
  here: { readonly stage?: string | null; readonly screen?: string | null },
): PluginPlace | null {
  if (scope === "window") return WINDOW_PLACE
  return (scope === "screen" ? here.screen : here.stage) ?? null
}

// 範囲 scope の宣言の、場所 at の値の場所（at はその範囲のステージかスクリーンの id。窓の範囲の宣言は at を見ない）
export const placeAt = (scope: PluginStateScope, at: PluginPlace): PluginPlace | null =>
  placeOf(scope, typeof at === "string" ? { stage: at, screen: at } : {})

// 宣言 def の今の値（窓の範囲の宣言は窓の値、ステージの宣言は at のステージの値、スクリーンの宣言は at のスクリーンの値。無ければ undefined）
export function pluginValueOf<S>(values: PluginValues, at: PluginPlace, def: PluginStateDef<S>): S | undefined {
  if (def.scope === "window") return values.window[def.id] as S | undefined
  if (typeof at !== "string") return undefined
  return (def.scope === "stage" ? values.stages[at] : values.screens[at])?.[def.id] as S | undefined
}

// 画面の場所に入れて、変わるたびにブラウザの履歴に積むと宣言した id の組
export const pushingIds = (defs: PluginStateDefs): ReadonlySet<string> =>
  new Set([...defs.values()].filter(d => d.address === "push").map(d => d.id))

// 宣言の表 defs と窓 win で、値の組 values の宣言 id の値を value にした値の組（変わらなければ values のまま）。画面の場所に入れる宣言の値は宣言の形で確かめる（合わなければ E123）。
// 場所 at は、窓の範囲の宣言なら WINDOW_PLACE、ステージごとの宣言ならステージの id（窓に無いステージには置かない）、スクリーンごとの宣言なら開いているスクリーンの id（無いスクリーンには置かない）。
// 知らない id は E122、範囲と場所が合わなければ E124
export function withPluginValueIn(
  defs: PluginStateDefs,
  win: WindowState,
  values: PluginValues,
  id: string,
  at: PluginPlace,
  value: unknown,
): PluginValues {
  const def = defs.get(id) ?? fail("E122", { id })
  if (def.scope === "window" && at !== WINDOW_PLACE) fail("E124", { id, scope: "window", need: "give WINDOW_PLACE" })
  if (def.scope === "stage" && typeof at !== "string") fail("E124", { id, scope: "stage", need: "give the stage" })
  if (def.scope === "screen" && typeof at !== "string") fail("E124", { id, scope: "screen", need: "give the screen" })
  let next = value
  if (value !== undefined && def.address !== "none") {
    const read = def.schema?.safeParse(value)
    if (!read?.success) fail("E123", { id })
    next = read.data
  }
  // 画面の場所に入れる宣言の値は中身を比べ、入れない宣言の値は同じ物かだけ比べる（頻繁に書く値を深く比べない）
  const same = def.address === "none" ? Object.is : sameData
  if (typeof at !== "string") {
    return same(values.window[id], next) ? values : { ...values, window: withPluginState(values.window, id, next) }
  }
  const stage = at
  if (def.scope === "screen") {
    const opened = win.screens.some(s => s.id === stage)
    if (!opened || same(values.screens[stage]?.[id], next)) return values
    return { ...values, screens: { ...values.screens, [stage]: withPluginState(values.screens[stage], id, next) } }
  }
  if (stageIn(win, stage) === undefined || same(values.stages[stage]?.[id], next)) return values
  return { ...values, stages: { ...values.stages, [stage]: withPluginState(values.stages[stage], id, next) } }
}

// 宣言の表 defs と窓 win で、ほかのプラグインの宣言 id に値 value を入れる場所（入れられなければ null）。画面の場所に入れる宣言（address を持つ）で、値が宣言の形に合うときだけ。
// ステージの宣言は caller.stage の窓にあるステージ、窓の宣言は WINDOW_PLACE。スクリーンの宣言は、caller.screenDef の開いているスクリーン（複数なら最後にカレントにした 1 枚）、
// screenDef が無ければ caller.screen（開いているスクリーンだけ）
export function pluginPlaceById(
  defs: PluginStateDefs,
  win: WindowState,
  id: string,
  value: unknown,
  caller: { screen?: string; screenDef?: string; stage?: string },
): PluginPlace | null {
  const def = defs.get(id)
  if (!def || def.address === "none" || !def.schema?.safeParse(value).success) return null
  const callerScreen = (): string | null => {
    if (caller.screenDef === undefined) return caller.screen ?? null
    const ids = win.screens.filter(s => s.def === caller.screenDef).map(s => s.id)
    return [...win.order].reverse().find(o => ids.includes(o)) ?? null
  }
  const at = placeOf(def.scope, { stage: caller.stage, screen: callerScreen() })
  if (at === null) return null
  if (def.scope === "screen" && !win.screens.some(s => s.id === at)) return null
  if (def.scope === "stage" && stageIn(win, at as string) === undefined) return null
  return at
}
