// スキンの定義: アプリの枠（上の行・タブ・ダイアログ・ステージの地）の見た目。見る人の設定で選び、ブックの中身（テーマ）には効かない。
// どのスキンも土台が決めたスキンキー（SkinToken）の値を全部埋める（抜けると型の誤り）。スキンキーは CSS 変数 --skin-<スキンキー> になり、ウィジェットはこのスキンキーだけで色を付ける
import type { SkinExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export const SKIN_TOKENS = [
  "bg",
  "grid",
  "text",
  "hint",
  "bar",
  "tools",
  "line",
  "btn",
  "btn-hover",
  "accent",
  "current", // 分けているときのカレントのステージの下の行の地
  "divider", // 分けているときの境目をつかんでいる間の線
  "float", // 画面の上に浮かぶ丸いボタン（道具のアイコン）の地
  "float-line", // 浮かぶボタンの縁
  "float-hover", // 浮かぶボタンにポインタを乗せたときの地
  "on-accent", // 強調の色の地の上の文字とアイコン
  "danger", // 取り消せない操作（消すなど）のボタンの文字と縁。誤りのトーストの印
  "warn", // 断りや注意のトーストの印
  "font",
] as const

export type SkinToken = (typeof SKIN_TOKENS)[number]
export type Scheme = "light" | "dark"

export interface SkinDef extends SkinExtras {
  id: string
  title: MessageKey
  scheme: Scheme // 入力Formやスクロールバーの明暗。自動のスキンは、OS の明暗と同じ明暗のスキンから選ぶ
  tokens: Readonly<Record<SkinToken, string>>
}

export function defineSkin<const T extends SkinDef>(def: T): T {
  return def
}
