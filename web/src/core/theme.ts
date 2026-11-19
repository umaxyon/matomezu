// テーマに書かれた値: 明暗ごとの色の形（Shades）と、テーマキーに書かれた値の引き方（writtenValues。台帳アセンブルの確かめと、base が値を決めるときに読む）。
// テーマの値を決めるのは base（plugins/base/book-look/tokens.ts の resolveTokens）

import type { ThemeDef, ThemeValue, TokenDef } from "./def/theme"
import { splitId } from "./names"

// 明暗ごとに決めた色（明暗で同じなら、どちらも同じ色）
export interface Shades {
  light: string
  dark: string
}

// テーマ theme でテーマキー def に書かれた値（引く順: テーマの上書き、宣言のテーマごとの値）。どちらも無ければ空。
// by は書いた者: テーマの上書きはテーマのプラグイン、宣言のテーマごとの値はテーマキーを宣言したプラグイン（値の誤りの warning はその者のもの）
export const writtenValues = (theme: ThemeDef, def: TokenDef): { value: ThemeValue; by: string }[] => {
  const own = theme.tokens?.[def.id]
  const declared = (def.themeValues as Readonly<Record<string, ThemeValue>> | undefined)?.[theme.id]
  return [
    ...(own === undefined ? [] : [{ value: own, by: splitId(theme.id).owner ?? "" }]),
    ...(declared === undefined ? [] : [{ value: declared, by: splitId(def.id).owner ?? "" }]),
  ]
}
