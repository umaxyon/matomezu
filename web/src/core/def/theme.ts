// テーマの定義: ブックの中身の見た目。色・線・影など並べ方を変えないものだけを持ち、大きさは変えない。
// どのテーマも共通のテーマキー（ThemeToken）を全部埋める。アイテムとブックのタイプは自分の使うテーマキーを宣言し（TokenDecl）、
// 既定の値は共通のテーマキーか、宣言に書いた値から取る。テーマは知っているテーマキーだけを上書きする。
// どのテーマも代表色（core/color の PALETTE の役割ごとの色）を持つ
import type { PaletteName } from "../color"
import type { MessageKey } from "../i18n/i18n"
import { splitId } from "../names"

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

// アイテムやブックのタイプが使うテーマキー。id は本当の id（例: @matomezu/box:box-fill。pluginKit が頭を付ける）。値はテーマが上書きしなければ、fallback の共通のテーマキーか、
// value に書いた値（共通のテーマキーに当たるものが無いテーマキー。角の丸み・影など）
export type TokenDecl = { id: string; fallback: ThemeToken } | { id: string; value: ThemeValue }

// テーマキーの値を入れる CSS 変数の名前（matomezu の中だけのもの）。土台のテーマキーは --theme-<名前>（「.」は「-」。例: palette.primary → --theme-palette-primary）、
// プラグインのテーマキーは本当の id の英小文字・数字・- 以外を _ と 16 進にした名前（どの id も別の名前になる）
export const tokenVarName = (id: string): string =>
  splitId(id).owner === null
    ? `--theme-${id.replaceAll(".", "-")}`
    : `--theme-${id.replace(/[^a-z0-9-]/g, c => `_${c.charCodeAt(0).toString(16).padStart(2, "0")}`)}`
// プラグインのテーマキーを、そのプラグインの見た目で使う CSS 変数の名前（--<名前>。matomezu が描く要素に置く）
export const ownTokenVarName = (id: string): string => `--${splitId(id).name}`
// テーマキーの値を使う CSS の値（ビューの style や属性に書く）: 土台のテーマキーは var(--theme-…)、プラグインのテーマキーは自分の見た目の中の var(--<名前>)
export const themeVar = (id: string): string =>
  `var(${splitId(id).owner === null ? tokenVarName(id) : ownTokenVarName(id)})`

// テーマキーの値: 色 1 つか、明暗ごとの色。明暗の両方を書いたテーマキーは見る人の OS の明暗で切り替え、片方だけなら明暗どちらでもその色
// （全部のテーマキーが色 1 つか片方だけなら、固定のテーマ）
export type ThemeValue =
  | string
  | Readonly<{ light: string; dark?: string }>
  | Readonly<{ light?: string; dark: string }>

export interface ThemeDef {
  id: string
  title: MessageKey
  base: Readonly<Record<ThemeToken, ThemeValue>>
  palette: Readonly<Record<PaletteName, ThemeValue>> // 代表色（#rrggbb）
  tokens?: Readonly<Record<string, ThemeValue>> // 宣言されたテーマキー（TokenDecl の id）の上書き
}

export function defineTheme<const T extends ThemeDef>(def: T): T {
  return def
}
