// プラグイン状態の定義: プラグインが画面の中で持つ状態 1 つの宣言（id・範囲・画面の場所に入れるか・値の形）。置き場は store の pluginValues 1 つだけ（アクションのデータとは別。アクションでは変えない）。
// scope は値の範囲: stage はステージごとの値（ステージを閉じたら消える）、window はステージに結ばないステージに結ばない値。
// address は、値を画面の場所（core/address.ts。ホストがブラウザの URL に写す）に入れるか: push は入れて、変わるたびにブラウザの履歴に積む。replace は入れて、今の履歴を書き換える。
// none は入れない（読み直すと消える）。決めるのは宣言する側。入れる宣言は、外（URL）から来る値を読むために値の形 schema（zod）を持ち、core は値の中を読まず、この形で確かめるだけ。
// 入れない宣言は外から値が来ないので schema を持たず、値の型だけを持つ（defineDialogWith と同じく、kit.definePluginStateOf<値の型>()）
import type { z } from "zod"
import type { PluginStateExtras } from "../catalog"

// 画面の場所に入れる値の形（zod）
export type PluginStateSchema<S> = z.ZodType<S>

export type PluginStateScope = "stage" | "window"
export type PluginStateAddress = "push" | "replace" | "none"

// 値の型 S を、型だけで持たせる印
declare const stateType: unique symbol

export interface PluginStateDef<S = unknown> extends PluginStateExtras {
  readonly [stateType]?: S
  id: string // 本当の id（例: @matomezu/markdown:pane-layout）
  scope: PluginStateScope
  address: PluginStateAddress
  schema?: PluginStateSchema<S> // address が none でなければ必ずある（kit.definePluginState の型が求める）
}
