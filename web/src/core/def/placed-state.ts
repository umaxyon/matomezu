// 場所に入れる画面の状態の定義（宣言）: プラグインが「id ＋ 値の形」で、画面の場所（core/address.ts。ホストがブラウザの URL に写す）に入れて、読み直しても戻す値を宣言する。
// core は値の中を読まず、宣言した形（schema）で確かめるだけ。値の置き場は store の placedValues（アクションのデータとは別。アクションでは変えない）。
// scope は値の範囲: stage はステージごとの値（ステージを閉じたら消える）、frame はステージに結ばない値（窓の外観枠の状態と同じ範囲）。
// browserHistory は、値が変わったときブラウザの履歴に積むか（push）、今の履歴を書き換えるか（replace）。決めるのは宣言する側
import type { z } from "zod"
import type { PlacedStateExtras } from "../catalog"

export type PlacedScope = "stage" | "frame"

export interface PlacedStateDef<S = unknown> extends PlacedStateExtras {
  id: string // 本当の id（例: @matomezu/markdown:pane-layout）
  scope: PlacedScope
  schema: z.ZodType<S> // 場所に入れる値の形
  browserHistory: "push" | "replace"
}
