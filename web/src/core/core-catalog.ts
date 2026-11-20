// core 台帳: ページのタイプ・アイテム・アクション・設定の項目・テーマ・紙の表。定義の組（CoreCatalogParts）から buildCoreCatalog で作り、作った後は変えない。
// 表どうしの参照（ページのタイプが使うアイテムなど）が実在するかは checkCoreCatalog（core-catalog-check.ts）が確かめ、食い違いがあれば作らない。
// ブックのデータの形は、ページのタイプが自分で持つフィールドに、タイプが選んだものから組み立てたフィールド（ページと、そこに置けるアイテム・設定の項目）を足して作る（buildBookSchemas）

import { z } from "zod"
import { type CorePart, type ItemId, type ItemTable, type PartDefTable, partsOf } from "./catalog"
import { allLanguages, allMessages, byId, checkCoreCatalog, coreWarnings, mergeMessages } from "./core-catalog-check"
import type { ActionDef } from "./def/action"
import type { AnnotationDef } from "./def/annotation"
import type { ControlCenterDef } from "./def/control-center"
import type { EnumDef, EnumValueDef } from "./def/enum"
import type { ItemDef } from "./def/item"
import type { MailDef } from "./def/mail"
import type { NormalizeStepDef } from "./def/normalize-step"
import type { PageTypeDef } from "./def/page-type"
import type { PaperDef } from "./def/paper"
import type { PermissionDef } from "./def/permission"
import type { PresentationDef } from "./def/presentation"
import type { ScreenArrangementDef } from "./def/screen-arrangement"
import type { ScreenDef } from "./def/screen-def"
import type { HeldSettingDef, SettingDef, SettingRole, UserSettingDef } from "./def/setting"
import type { SkinDef } from "./def/skin"
import type { SubjectDef } from "./def/subject"
import type { SystemFolderDef } from "./def/system-folder"
import type { TextColorDef } from "./def/text-color"
import type { ThemeDef, TokenDef } from "./def/theme"
import type { ToolDef, ToolSetDef } from "./def/tool"
import { fail, matomezuError, type Problem, problem } from "./errors"
import type { Messages } from "./i18n/i18n"
import type { Lang, LanguagePackDef, MessageSetDef } from "./i18n/messages"
import { placedSchema } from "./placed"
import { PageSchema } from "./schema/page"
import type { Warning } from "./warnings"

export type { ActionId, ItemId, PageTypeId, PaperId, SettingId, SkinId, ThemeId } from "./catalog"

// アイテムの、置いたものが持つ項目の型
export type ItemProps<K extends ItemId> = z.infer<ItemTable[K]["props"]>

// core 台帳の定義の種類の、定義の型（スキンは matomezu 外観枠の色や形で、利用者の設定で選ぶ）
declare module "./catalog" {
  interface PartDefTable {
    pageTypes: PageTypeDef
    controlCenters: ControlCenterDef
    items: ItemDef
    actions: ActionDef
    settings: HeldSettingDef
    userSettings: UserSettingDef
    presentations: PresentationDef
    themes: ThemeDef
    papers: PaperDef
    textColors: TextColorDef
    skins: SkinDef
    tools: ToolDef
    toolSets: ToolSetDef
    permissions: PermissionDef
    annotations: AnnotationDef
    systemFolders: SystemFolderDef
    mails: MailDef
    subjects: SubjectDef
    screens: ScreenDef
    screenArrangements: ScreenArrangementDef
    enums: EnumDef
    enumValues: EnumValueDef
  }
}

// 表を作るもとの、定義の組: core 台帳の種類ごとの定義の並びと、文言・言語
export type CoreCatalogParts = { readonly [K in CorePart]: readonly PartDefTable[K][] } & {
  messages: readonly MessageSetDef[] // 土台の文言（CORE_MESSAGES）は、いつも表に入る
  languages: readonly LanguagePackDef[] // 土台の言語（LANGUAGES: 英語と日本語）は、いつも表に入る
  tokens: readonly TokenDef[] // プラグインが持つテーマキー（そのプラグインのいくつものアイテムやタイプが共に使う）
  normalizeSteps: readonly NormalizeStepDef[] // ノーマライズステップ（ビルトインプラグインが持つ。並びの順にかける）
}

// 作った表。種類ごとに id で引く。pageSchemas は、ページのタイプごとに組み立てたページのデータの形。bookSchema は、ブックのデータの形（並びのページは、タイプごとの形のどれか）
export type CoreCatalog = { readonly [K in CorePart]: ReadonlyMap<string, PartDefTable[K]> } & {
  parts: CoreCatalogParts
  pageSchemas: ReadonlyMap<string, z.ZodObject>
  messageSets: ReadonlyMap<string, MessageSetDef> // 文言の組（土台の組を含む）
  languagePacks: ReadonlyMap<string, LanguagePackDef> // 言語パック（土台の言語を含む）
  messages: Messages // 文言の組と言語パックを重ねた、文言の鍵 → 言語ごとの訳
  languages: ReadonlyMap<Lang, string> // インスタンスで選べる言語 → 名前（土台の言語が先、あとはパックの順）
  bookSchema: z.ZodType
  warnings: readonly Warning[] // 台帳アセンブルで見つけた、止めるほどではない間違い（core/warnings.ts）
  tokens: ReadonlyMap<string, TokenDef> // プラグインが持つテーマキー（アイテムとページのタイプのテーマキーは、その定義の tokens）
  normalizeSteps: readonly NormalizeStepDef[] // ノーマライズステップ（core/def/normalize-step.ts）
  roles: ReadonlyMap<SettingRole, SettingDef> // role → その role を持つ利用者の設定の項目（土台は role で引く）
}

// 台帳アセンブルのときの確かめ: 作った機能台帳を受けて、問題（error の番号は E の表）と warning（W の表）を返す。ビルトインプラグインだけが持てる
// （プラグインの checks。ビルトインプラグインが拡張ポイントに書き足したフィールドを確かめる）。問題が 1 つでもあれば台帳アセンブルを止め、warning は store 台帳に残す
export type CatalogCheckDef = (catalog: CoreCatalog) => readonly (Problem | Warning)[]

// 食い違いがあれば、直す所が分かる文を並べて error にする
export function buildCoreCatalog(parts: CoreCatalogParts): CoreCatalog {
  const problems = checkCoreCatalog(parts)
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const pageSchemas = new Map(parts.pageTypes.map(t => [t.id, buildPageSchema(parts, t)]))
  if (pageSchemas.size === 0) return fail("E015")
  // 種類ごとの表（Object.fromEntries はフィールドの型を残さないので、種類ごとの定義の型を言い張る）
  const tables = Object.fromEntries(partsOf("core").map(k => [k, byId<{ id: string }>(parts[k])])) as unknown as {
    [K in CorePart]: ReadonlyMap<string, PartDefTable[K]>
  }
  return {
    ...tables,
    parts,
    pageSchemas,
    messageSets: byId(allMessages(parts)),
    languagePacks: byId(allLanguages(parts)),
    messages: mergeMessages(parts),
    languages: new Map(allLanguages(parts).map(p => [p.lang, p.name])),
    bookSchema: buildBookSchema(parts, pageSchemas),
    warnings: coreWarnings(parts),
    tokens: byId(parts.tokens),
    normalizeSteps: parts.normalizeSteps,
    roles: new Map(parts.userSettings.flatMap(d => (d.role ? [[d.role, d] as const] : []))),
  }
}

// 選んだ設定の項目を、項目の id を鍵にした settings のフィールドにする。
// 機能台帳に無い項目（プラグインを外したなど）は、そのまま残す（機能台帳にあって選んでいない項目があれば形に合わない）
function settingsField(parts: CoreCatalogParts, ids: readonly string[]): Record<string, z.ZodType> {
  const settings = byId(parts.settings)
  const defs = ids.flatMap(id => settings.get(id) ?? [])
  return {
    settings: z
      .object(Object.fromEntries(defs.map(d => [d.id, d.schema.optional()])))
      .catchall(z.unknown())
      .superRefine((v, ctx) => {
        for (const k of Object.keys(v))
          if (!ids.includes(k) && settings.has(k)) ctx.addIssue({ code: "custom", path: [k], message: "not selected" })
      })
      .optional(),
  }
}

// タイプのページのデータの形: 土台のページのフィールド（type はそのタイプの id だけ）・タイプがページに足すフィールド（fields）・
// タイプが選んだアイテムを置いた並び（items）・形だけの並び（slide）・ページの設定の項目（settings）
function buildPageSchema(parts: CoreCatalogParts, t: PageTypeDef): z.ZodObject {
  const items = byId(parts.items)
  const allowed = t.items.allowed.flatMap(id => items.get(id) ?? [])
  // 機能台帳に無いアイテム（プラグインを外したなど）: id と item だけを確かめ、ほかのフィールドはそのまま残す
  const unknownItem = z.looseObject({ id: z.string().min(1), item: z.string().refine(id => !items.has(id)) })
  // 子の形（shapes の中）に入るのは、タイプが選んだ形と機能台帳に無いアイテム（何段でも同じ）
  const child: z.ZodType = z.lazy(() => childShape)
  const placed = allowed.map(def => placedSchema(def, child))
  const [firstShape, ...moreShapes] = placed.filter((_, i) => allowed[i]?.kind === "shape")
  const childShape = firstShape
    ? z.union([z.discriminatedUnion("item", [firstShape, ...moreShapes]), unknownItem])
    : unknownItem
  const [one, ...more] = placed
  return PageSchema.extend({
    type: z.literal(t.id),
    ...t.fields,
    items: z.array(one ? z.union([z.discriminatedUnion("item", [one, ...more]), unknownItem]) : unknownItem).optional(),
    ...slideField(t, items),
    ...settingsField(parts, t.settings ?? []),
  })
}

// ブックのデータの形: 名前 title（1 字以上）・ロック locked・並び lineup・ブックが持つ設定の項目（holder が "outermost" の項目）。
// エントリ 1 つは、ページ（kind が "page"。タイプごとの形のどれか）か、1 つのタイプのページだけを入れるバインダ（中身も同じ並びで、入るのはページだけ）
function buildBookSchema(parts: CoreCatalogParts, pageSchemas: ReadonlyMap<string, z.ZodObject>): z.ZodType {
  const [first, ...rest] = [...pageSchemas.values()]
  if (!first) return fail("E015")
  const page = z.discriminatedUnion("type", [first, ...rest])
  const binderEntry = z.strictObject({
    kind: z.literal("binder"),
    id: z.string().min(1),
    title: z.string().min(1),
    pageType: z.string().min(1),
    lineup: z.array(page),
  })
  return z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    locked: z.literal(true).optional(),
    lineup: z.array(z.union([page, binderEntry])),
    ...settingsField(
      parts,
      parts.settings.filter(d => d.holder === "outermost").map(d => d.id),
    ),
  })
}

// ページの slide（形だけの並び）: タイプが選んだ形を置いた並び。選んでいなければフィールドを足さない。
// 機能台帳に無いアイテム（プラグインを外したなど）は、items と同じく id と item だけを確かめて残す
function slideField(t: PageTypeDef, items: ReadonlyMap<string, ItemDef>): Record<string, z.ZodType> {
  if (!t.slide) return {}
  const shapes = t.slide.allowed.flatMap(id => {
    const def = items.get(id)
    return def?.kind === "shape" ? [placedSchema(def)] : []
  })
  const unknown = z.looseObject({ id: z.string().min(1), item: z.string().refine(id => !items.has(id)) })
  const [one, ...more] = shapes
  return { slide: z.array(one ? z.union([z.discriminatedUnion("item", [one, ...more]), unknown]) : unknown).optional() }
}

// ページのタイプは、データのタイプが表に無ければ error。ほかの定義は catalog.items.get(id) などで引き、知らない id なら undefined
// （データに残った、外したプラグインのアイテムなど）
export function pageType(catalog: CoreCatalog, id: string): PageTypeDef {
  return catalog.pageTypes.get(id) ?? fail("E101", { id })
}
