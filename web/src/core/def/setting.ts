// 設定の項目の定義: ページかステージエントリ（ブック・ブックの外のバインダ・ブックの外のページ 1 枚）に持たせる 1 つの値（線の既定の通り方など）。持つ所は holder で決まる: "page" の項目は、ページのタイプが自分のページに持たせる項目として id で選ぶ。
// "outermost" の項目は、タイプに依らず、どのステージエントリも持てる（ページを並べて刷るときの決まりなど）。
// 値は持つ物（ページ・バインダ・ブック）のデータの settings のフィールドに、項目の id を鍵にして入れ、どれも書かなくてよい（例: settings: { "@matomezu/line:line-route": "elbow" }）。読むときは、値があればその値、無ければ既定（default）（plugins/base/book-settings の settingValue）。ページの項目がステージエントリの値を引き継ぐことは無い。
// 既定を持たない項目は、値が無ければ undefined で、読む側が決める（base のテーマはページのタイプのテーマ、紙の色はテーマの紙の色）。
// 同じ定義で、プラグインの userSettings に入れれば利用者の設定の項目になる（holder は書かない）。値は利用者の設定（core/settings.ts）に、項目の id を鍵にして入れる。1 つの項目をページ・ステージエントリと利用者の両方には使わない
import type { z } from "zod"
import type { SettingExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { MessageKey } from "../i18n/i18n"

// 土台が読む利用者の設定の項目の role: lang は言語（値は言語パックの id）、skin はスキン（スキンの id か "auto"）、keys はキーバインドの、利用者の変更、
// participant-alive は参加者が「生きている」とする長さ（値は分の数。数か、数の文字）、enabled-plugins は有効にした追加プラグインの id の並び（足したときは無効）、
// update-check は常駐が新しい版を自分で確かめるか（値は真偽）、connect-hosts はほかのホストとつなぐか（値は真偽。入なら常駐がホストどうしの入口を開く）、
// host-name はホスト名（値は字。無ければ OS のホスト名）
export type SettingRole =
  | "lang"
  | "skin"
  | "keys"
  | "participant-alive"
  | "enabled-plugins"
  | "update-check"
  | "connect-hosts"
  | "host-name"

export interface SettingDef<S extends z.ZodType = z.ZodType, Tt extends string = MessageKey> extends SettingExtras {
  id: string // 本当の id（例: @matomezu/line:line-route）
  title: Tt
  schema: S // 値の形
  default?: z.output<S> // どこにも値が無いときの値
  // 値の形を、機能台帳から組み立てる（入れてある言語パックのどれかなど）。無ければ schema。変えるときに受け付けるか（ブックの設定も利用者の設定も）と、利用者の設定で読んだ値を使うかは、この形で決める。
  // of は、どのタイプのページの項目として組み立てるか（テーマならタイプが使えるテーマだけ）か、ブックの項目か、利用者の設定の項目か。
  // ページ（ブック）のデータを読むときの形は schema（機能台帳の物が減っても、ブックは読める）
  describe?(catalog: CoreCatalog, of: SettingOwner): z.ZodType
  userOnly?: true // 利用者の設定の項目で、利用者だけが変える（AI には断り、AI が読む設定にも出さない）
  role?: SettingRole // 土台が読む利用者の設定の項目（ビルトインプラグインの利用者の設定の項目だけが持ち、1 つの role は 1 つの項目だけ）
  holder?: SettingHolder // 値を持つ所（ページかステージエントリ。利用者の設定の項目は書かない）
}

// 設定の項目の値を持つ所: ページ（タイプが選ぶ）か、ステージエントリ（どのステージエントリも持てる）
export type SettingHolder = "page" | "outermost"
// ページの設定の項目・ステージエントリが持つ設定の項目・利用者の設定の項目（holder で分かれる。読む関数は、合う holder の項目だけを受ける）
export type PageSettingDef<S extends z.ZodType = z.ZodType> = SettingDef<S> & { holder: "page" }
export type OutermostSettingDef<S extends z.ZodType = z.ZodType> = SettingDef<S> & { holder: "outermost" }
export type HeldSettingDef = SettingDef & { holder: SettingHolder }
export type UserSettingDef = SettingDef & { holder?: never }

// 設定の項目を持つ所: タイプ pageType のページか、いちばん外（outermost）か、利用者の設定（user）
export type SettingOwner = { pageType: string } | "outermost" | "user"

// 既定を持つ設定の項目の定義（どこにも値が無くても、読めば既定の値がある）
export type DefaultedSettingDef<S extends z.ZodType = z.ZodType, Tt extends string = MessageKey> = SettingDef<S, Tt> & {
  default: z.output<S>
}

export function defineSetting<const Id extends string, S extends z.ZodType>(
  def: SettingDef<S> & { id: Id },
): SettingDef<S> & { id: Id } {
  return def
}
