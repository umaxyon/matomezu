// プラグイン状態の定義: プラグインが画面の中で持つ状態 1 つの宣言（id・範囲・画面の場所に入れるか・値の形）。置き場は store の pluginValues 1 つだけ（アクションのデータとは別。アクションでは変えない）。
// scope は値の範囲: stage はステージごとの値（ステージを閉じたら消える）、screen は開いているスクリーン 1 枚ごとの値（スクリーンを閉じたら消える）、window はステージに結ばない値。
// address は、値を画面の場所（core/address.ts。ホストがブラウザの URL に写す）に入れるか: push は入れて、変わるたびにブラウザの履歴に積む。replace は入れて、今の履歴を書き換える。
// none は入れない（読み直すと消える）。決めるのは宣言する側。入れる宣言は、外（URL）から来る値を読むために値の形 schema（zod）を持ち、core は値の中を読まず、この形で確かめるだけ。
// 入れない宣言は外から値が来ないので schema を持たず、値の型だけを持つ（defineDialogWith と同じく、kit.definePluginStateOf<値の型>()）
import type { z } from "zod"
import type { PluginStateExtras } from "../catalog"

// 画面の場所に入れる値の形（zod）
export type PluginStateSchema<S> = z.ZodType<S>

export type PluginStateScope = "stage" | "screen" | "window"
export type PluginStateAddress = "push" | "replace" | "none"

// 値の型 S を、型だけで持たせる印
declare const stateType: unique symbol

// プラグイン状態に値が無いときの値（既定 default を持たない宣言の値が無いとき。どの値とも重ならないよう、値の形の物にしない）
export const NO_STATE: unique symbol = Symbol("no state")

// 宣言 D の値の型
export type StateOf<D> = D extends PluginStateDef<infer S> ? S : never
// 宣言 D を読んだときの値の型（既定 default を持つ宣言は値の型、持たない宣言は値の型か NO_STATE）
export type StateRead<D> = D extends { default: infer S } ? S : StateOf<D> | typeof NO_STATE

// 宣言 D の値を今の値から変える関数が返す値（NO_STATE なら値を消す）
export type StateChange<D> = StateOf<D> | typeof NO_STATE
// 変える関数が返した値 next の、置く値（NO_STATE なら、消す印の undefined）
export const storedOf = (next: unknown): unknown => (next === NO_STATE ? undefined : next)

// 宣言 def の、置いてある値 stored（無ければ undefined）を読んだ値: 値が無ければ既定、既定も無ければ NO_STATE
export const stateRead = <D extends PluginStateDef<unknown>>(def: D, stored: unknown): StateRead<D> =>
  (stored !== undefined ? stored : def.default !== undefined ? def.default : NO_STATE) as StateRead<D>

// プラグイン状態の今の値を読む関数: 宣言 def の値（StateRead）。渡す側が、読める宣言（持ち主のプラグインの物）と、どのスクリーン・ステージの値かを決める
export type PluginStateRead = <D extends PluginStateDef<unknown>>(def: D) => StateRead<D>

export interface PluginStateDef<S = unknown> extends PluginStateExtras {
  readonly [stateType]?: S
  id: string // 本当の id（例: @matomezu/markdown:pane-layout）
  scope: PluginStateScope
  address: PluginStateAddress
  schema?: PluginStateSchema<S> // address が none でなければ必ずある（kit.definePluginState の型が求める）
  default?: S // 値が無いときに読む値（持たなければ、値が無いときは NO_STATE を読む）
}
