// テーマの定義: ブックの中身の見た目。色・線・影など並べ方を変えないものだけを持ち、大きさは変えない。
// どのテーマも共通の欄（ThemeToken）を全部埋める。アイテムとブックのタイプは自分の使う欄を宣言し（TokenDecl）、
// 既定の値は共通の欄か、宣言に書いた値から取る。テーマは知っている欄だけを上書きする。
// どのテーマも代表色（core/color の PALETTE の役割ごとの色）を持つ
import type { PaletteName } from "../color"
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

// アイテムやブックのタイプが使う欄。id は「持ち主.名前」（例: box.fill）。値はテーマが上書きしなければ、fallback の共通の欄か、
// value に書いた値（共通の欄に当たるものが無い欄。角の丸み・影など）
export type TokenDecl = { id: string; fallback: ThemeToken } | { id: string; value: ThemeValue }

// 欄の値を入れる CSS 変数の名前: 頭に --theme-、欄の id の「/」は「--」、「.」は「-」（例: box.fill → --theme-box-fill、ex3/star.fill → --theme-ex3--star-fill）
export const themeVarName = (id: string): string => `--theme-${id.replaceAll("/", "--").replaceAll(".", "-")}`
// 欄の値を使う CSS の値（var(--theme-…)。ビューの style や属性に書く）
export const themeVar = (id: string): string => `var(${themeVarName(id)})`

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
  palette: Readonly<Record<PaletteName, ThemeValue>> // 代表色（#rrggbb）
  tokens?: Readonly<Record<string, ThemeValue>> // 宣言された欄（TokenDecl の id）の上書き
}

export function defineTheme<const T extends ThemeDef>(def: T): T {
  return def
}
