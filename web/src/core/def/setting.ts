// 設定の項目の定義: ブックやページに持たせる 1 つの値（線の既定の通り方など）。ブックのタイプが、ブックとページに持たせる項目を id で選ぶ。
// 値はブック（ページ）のデータの settings の欄に、項目の id を鍵にして入れ、どれも書かなくてよい（例: settings: { "@matomezu/line:line-route": "elbow" }）。読むときは ページ → ブック → 既定（default）の順に、最初に値のある所で決まる（core/book-settings.ts の settingValue）。
// 既定を持たない項目は、どこにも値が無ければ undefined で、読む側が決める（base のテーマはブックのタイプのテーマ、紙の色はテーマの紙の色）
import type { z } from "zod"
import type { MessageKey } from "../i18n/i18n"

export interface SettingDef<S extends z.ZodType = z.ZodType, Tt extends string = MessageKey> {
  id: string // 本当の id（例: @matomezu/line:line-route）
  title: Tt
  schema: S // 値の形
  default?: z.output<S> // どこにも値が無いときの値
}

export function defineSetting<const Id extends string, S extends z.ZodType>(
  def: SettingDef<S> & { id: Id },
): SettingDef<S> & { id: Id } {
  return def
}
