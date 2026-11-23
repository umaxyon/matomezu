// ページの設定の項目と、ステージエントリ（ブック・ブックの外のバインダ・ブックの外のページ 1 枚）が持つ設定の項目。
// 項目のコンポーネントの並び（useSettingControls。SettingControls.tsx）も、このフォルダに置く
// ページの項目: ページのタイプが設定の定義（core/def/setting.ts。holder が "page"）を id で選び、機能台帳がページの形に settings のフィールド（項目の id → 値）を足す。
// ステージエントリが持つ項目: holder が "outermost" の設定の定義で、タイプに依らず、どのステージエントリも持てる。ブックかバインダの中へ入った物は持たない。
// 変える base のアクション（page-update・pages-update・book-update・print-preview-update）は、名前などの共通の項目に加えて、項目を settings（項目の id → 値）として受け付ける。書いた項目だけを変え、null は項目を消す（既定に戻す）。
// 変えたあとはページを整える（settleBook）。値は、値があればその値、無ければ定義の既定（settingValue）。ページの項目がステージエントリの値を引き継ぐことは無い。
// AI には、タイプごとの項目を引数の形に入れて見せる（settingsArgs）
import { z } from "zod"
import { pagesOf, putPage } from "../../../core/book"

import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import {
  type DefaultedSettingDef,
  type HeldSettingDef,
  NOT_SET,
  type OutermostSettingDef,
  type PageSettingDef,
  type SettingDef,
  type SettingHolder,
} from "../../../core/def/setting"
import { fail } from "../../../core/errors"
import type { ItemPage } from "../../../core/placed"
import type { Page, StageLineup } from "../../../core/schema/book"
import { settingSchema } from "../../../core/settings"
import { tidyConnectors } from "../place/placed"

// 設定の項目の組: print-preview は printPreview を書いた項目（アクション print-preview-update が変え、印刷プレビューの右サイドパネルに出す）、
// general はそのほか（page-update・pages-update・book-update が受け、設定のダイアログに並べる）
export type SettingGroup = "general" | "print-preview"

export const groupOf = (def: SettingDef): SettingGroup => (def.printPreview ? "print-preview" : "general")

// タイプ type が選んだ、ページの設定の定義（選んだ順）
export function settingDefs(catalog: CoreCatalog, type: string): PageSettingDef[] {
  return (pageType(catalog, type).settings ?? []).map(
    id => (catalog.settings.get(id) ?? fail("E113", { id })) as PageSettingDef,
  )
}

// ステージエントリが持つ設定の定義のうち、組 group の物（表の順）
export function outermostSettingDefs(catalog: CoreCatalog, group: SettingGroup = "general"): OutermostSettingDef[] {
  return [...catalog.settings.values()].filter(
    (d): d is OutermostSettingDef => d.holder === "outermost" && groupOf(d) === group,
  )
}

// 項目 defs を、変えるときに渡す形にする（どれも書かなくてよく、null は消す。項目の id で渡す。値の形は、持つ所 owner の項目として機能台帳から組み立てた形か schema）
function settingsPatch(
  catalog: CoreCatalog,
  owner: { pageType: string } | "outermost",
  defs: readonly SettingDef[],
): z.ZodObject {
  return z.strictObject(
    Object.fromEntries(defs.map(d => [d.id, settingSchema(catalog, d, owner).nullable().optional()])),
  )
}

// ページかステージエントリの settings のフィールド（無ければ空）
export const ownSettings = (target: object | null): Readonly<Record<string, unknown>> =>
  (target as { settings?: Record<string, unknown> } | null)?.settings ?? {}

// タイプ type のページの設定の項目を変えるときに渡す形（項目を選んでいなければ null）
export function settingsPatchOf(catalog: CoreCatalog, type: string): z.ZodObject | null {
  const defs = settingDefs(catalog, type)
  return defs.length > 0 ? settingsPatch(catalog, { pageType: type }, defs) : null
}

// ステージエントリが持つ設定の項目（組 group の物）を変えるときに渡す形（項目が無ければ null）
export function outermostSettingsPatch(catalog: CoreCatalog, group: SettingGroup = "general"): z.ZodObject | null {
  const defs = outermostSettingDefs(catalog, group)
  return defs.length > 0 ? settingsPatch(catalog, "outermost", defs) : null
}

// AI に見せる、ページの settings の形: 項目を選んだタイプごとの形のどれか（説明にタイプの id）
export function settingsArgs(catalog: CoreCatalog): z.ZodType {
  const each = [...catalog.pageTypes.values()].flatMap(t => {
    const patch = settingsPatchOf(catalog, t.id)
    return patch ? [patch.describe(`settings of ${t.id} pages`)] : []
  })
  const [first, ...rest] = each
  return first ? (rest.length ? z.union([first, ...rest]) : first) : z.strictObject({})
}

// ページの設定の項目 def の値を、項目の値の形で読む関数（既定を持つ項目は必ず値があり、持たない項目は値が無ければ NOT_SET）
export interface SettingReader {
  <S extends z.ZodType>(def: DefaultedSettingDef<S> & { holder: "page" }): z.output<S>
  <S extends z.ZodType>(def: PageSettingDef<S>): z.output<S> | typeof NOT_SET
}

// 設定の項目 def の値: 持つ所 holder（ページかステージエントリ。def の holder に合う物）の値、無ければ定義の既定（holder は無くてよい。無ければ既定。既定も無ければ NOT_SET）。
// 持つ所の値は、読み込むときとアクションのあとに機能台帳のブックの形（項目の schema）で確かめてあるので、ここでは確かめ直さない
// （利用者の設定は確かめずに残すので、読むときに確かめる。core/settings.ts の userSetting）
export function settingValue<S extends z.ZodType>(
  catalog: CoreCatalog,
  holder: object | null,
  def: DefaultedSettingDef<S> & { holder: SettingHolder },
): z.output<S>
export function settingValue<S extends z.ZodType>(
  catalog: CoreCatalog,
  holder: object | null,
  def: PageSettingDef<S> | OutermostSettingDef<S>,
): z.output<S> | typeof NOT_SET
export function settingValue(catalog: CoreCatalog, holder: object | null, def: HeldSettingDef): unknown {
  const known = catalog.settings.get(def.id) ?? fail("E113", { id: def.id })
  return ownSettings(holder)[known.id] ?? known.default ?? NOT_SET
}

// ページ page で効いている設定の値を読む関数
export function settingsAt(catalog: CoreCatalog, page: object | null): SettingReader {
  function read<S extends z.ZodType>(def: DefaultedSettingDef<S> & { holder: "page" }): z.output<S>
  function read<S extends z.ZodType>(def: PageSettingDef<S>): z.output<S> | typeof NOT_SET
  function read(def: PageSettingDef): unknown {
    return settingValue(catalog, page, def)
  }
  return read
}

// 形の置かれたページの事情: ページのタイプと、そのページで効いている設定の値
export interface PageContext {
  type: string
  setting: SettingReader
}

// ページ page の事情（ページのタイプと、そのページで効いている設定の値）。タイプや設定によって変わるつなぎ口などを決めるのに渡す
export const pageContext = (catalog: CoreCatalog, page: Pick<Page, "type">): PageContext => ({
  type: page.type,
  setting: settingsAt(catalog, page),
})

// 形か設定が変わったあとのページ: つなぐものの定義の整えを全部かける（place/placed.ts の tidyConnectors。そのページで効いている設定の値で）
export const tidyPage = <P extends ItemPage>(catalog: CoreCatalog, page: P): P =>
  tidyConnectors(catalog, page, settingsAt(catalog, page))

// 設定を変えたあとのブック: どのページも整える（tidyPage）。変わったページは putPage で替える
export function settleBook<B extends StageLineup>(catalog: CoreCatalog, book: B): B {
  let next = book
  for (const page of pagesOf(book)) {
    const tidy = tidyPage(catalog, page)
    if (tidy !== page) next = putPage(next, tidy)
  }
  return next
}
