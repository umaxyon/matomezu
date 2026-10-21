// スキンの定義: アプリの枠（上の行・タブ・ダイアログ・ステージの地）の見た目。見る人の設定で選び、ブックの中身（テーマ）には効かない。
// どのスキンも土台が決めた欄（SkinToken）を全部埋める（抜けると型の誤り）。欄は CSS 変数 --skin-<欄> になり、ウィジェットはこの欄だけで色を付ける
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
  "font",
] as const

export type SkinToken = (typeof SKIN_TOKENS)[number]
export type Scheme = "light" | "dark"

export interface SkinDef {
  id: string
  title: MessageKey
  scheme: Scheme // 入力欄やスクロールバーの明暗。自動のスキンは、OS の明暗と同じ明暗のスキンから選ぶ
  tokens: Readonly<Record<SkinToken, string>>
}

export function defineSkin<const T extends SkinDef>(def: T): T {
  return def
}
