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

// 欄の値: 色 1 つか、明暗ごとの色。明暗の両方を書いた欄は見る人の OS の明暗で切り替え、片方だけなら明暗どちらでもその色
// （全部の欄が色 1 つか片方だけなら、固定のテーマ）
export type ThemeValue =
  | string
  | Readonly<{ light: string; dark?: string }>
  | Readonly<{ light?: string; dark: string }>

export interface ThemeDef {
  id: string
  title: MessageKey
  base: Readonly<Record<ThemeToken, ThemeValue>>
  tokens?: Readonly<Record<string, ThemeValue>> // 宣言された欄（TokenDecl の id）の上書き
}

export function defineTheme<const T extends ThemeDef>(def: T): T {
  return def
}
