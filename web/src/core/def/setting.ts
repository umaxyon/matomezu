// 設定の項目の定義: ブックやページに持たせる 1 つの値（線の既定の通り方など）。ブックのタイプが、ブックとページに持たせる項目を id で選ぶ。
// 値はブック（ページ）のデータの settings のフィールドに、項目の id を鍵にして入れ、どれも書かなくてよい（例: settings: { "@matomezu/line:line-route": "elbow" }）。読むときは ページ → ブック → 既定（default）の順に、最初に値のある所で決まる（plugins/base/book-settings.ts の settingValue）。
// 既定を持たない項目は、どこにも値が無ければ undefined で、読む側が決める（base のテーマはブックのタイプのテーマ、紙の色はテーマの紙の色）。
// 同じ定義で、プラグインの userSettings に入れれば利用者の設定の項目になる。値は利用者の設定（core/settings.ts）に、項目の id を鍵にして入れる。1 つの項目をブックと利用者の両方には使わない
import type { z } from "zod"
import type { SettingExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { MessageKey } from "../i18n/i18n"

// 土台が読む利用者の設定の項目の役: lang は言語（値は言語パックの id）、skin はスキン（スキンの id か "auto"）、keys はキーの割り当ての、利用者の変更
export type SettingRole = "lang" | "skin" | "keys"

export interface SettingDef<S extends z.ZodType = z.ZodType, Tt extends string = MessageKey> extends SettingExtras {
  id: string // 本当の id（例: @matomezu/line:line-route）
  title: Tt
  schema: S // 値の形
  default?: z.output<S> // どこにも値が無いときの値
  // 値の形を、機能台帳から組み立てる（入れてある言語パックのどれかなど）。無ければ schema。受け付けるか・読んだ値を使うかは、この形で決める
  describe?(catalog: CoreCatalog): z.ZodType
  userOnly?: true // 利用者の設定の項目で、利用者だけが変える（AI には断り、AI が読む設定にも出さない）
  role?: SettingRole // 土台が読む利用者の設定の項目（ビルトインプラグインの利用者の設定の項目だけが持ち、1 つの役は 1 つの項目だけ）
}

export function defineSetting<const Id extends string, S extends z.ZodType>(
  def: SettingDef<S> & { id: Id },
): SettingDef<S> & { id: Id } {
  return def
}
