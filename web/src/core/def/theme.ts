// テーマの定義: ブックの中身の見た目。色・線・影など並べ方を変えないものだけを持ち、大きさは変えない。
// どのテーマも共通の欄（ThemeToken）を全部埋める。アイテムとブックのタイプは自分の使う欄を宣言し（TokenDecl）、
// 既定の値は共通の欄から取る。テーマは知っている欄だけを上書きする
import type { MessageKey } from "../i18n/i18n"

export const THEME_TOKENS = [
  "surface", // ブックの画面の地
  "paper",
  "paper-line",
  "paper-shadow",
  "text",
  "hint",
  "line",
  "fill",
  "accent",
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

// アイテムやブックのタイプが使う欄。id は「持ち主.名前」（例: box.fill）。値はテーマが上書きしなければ fallback の欄
export interface TokenDecl {
  id: string
  fallback: ThemeToken
}

export interface ThemeDef {
  id: string
  title: MessageKey
  base: Readonly<Record<ThemeToken, string>>
  tokens?: Readonly<Record<string, string>> // 宣言された欄（TokenDecl の id）の上書き
}

export function defineTheme<const T extends ThemeDef>(def: T): T {
  return def
}
