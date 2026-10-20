// スキンの定義: アプリの枠（上の行・タブ・ダイアログ・ステージの地）の見た目。見る人の設定で選び、ブックの中身には効かない。
// どのスキンも欄（SkinToken）を全部埋める（抜けると型の誤り）。欄は CSS 変数 --skin-<欄> になる
import type { MessageKey } from "../../core/i18n/i18n"

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

export interface SkinDef {
  id: string
  title: MessageKey
  scheme: "light" | "dark" // 入力欄やスクロールバーの明暗
  tokens: Readonly<Record<SkinToken, string>>
}

export function defineSkin<const T extends SkinDef>(def: T): T {
  return def
}
