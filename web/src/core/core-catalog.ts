// core 台帳: ページのタイプ・アイテム・アクション・設定の項目・テーマ・紙の表。定義の組（CoreCatalogParts）から buildCoreCatalog で作り、作った後は変えない。
// 表どうしの参照（ページのタイプが使うアイテムなど）が実在するかは checkCoreCatalog が確かめ、食い違いがあれば作らない。
// ブックのデータの形は、ページのタイプが自分で持つフィールドに、タイプが選んだものから組み立てたフィールド（ページと、そこに置けるアイテム・設定の項目）を足して作る（buildBookSchemas）

import { z } from "zod"
import { type CorePart, type ItemId, type ItemTable, PARTS, type PartDefTable, partsOf } from "./catalog"
import { HEX } from "./color"
import { type ActionDef, attachedTo, BASE_TARGETS } from "./def/action"
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
import { PARTICIPANT_STATES, SUBJECT_ROLE_FIELDS, type SubjectDef } from "./def/subject"
import type { SystemFolderDef } from "./def/system-folder"
import type { TextColorDef } from "./def/text-color"
import { THEME_TOKENS, type ThemeDef, type TokenDef } from "./def/theme"
import type { ToolDef, ToolSetDef } from "./def/tool"
import { enumValuesOf } from "./enum"
import { fail, matomezuError, type Problem, problem } from "./errors"
import type { Messages } from "./i18n/i18n"
import { CORE_MESSAGES, LANGUAGES, type Lang, type LanguagePackDef, type MessageSetDef } from "./i18n/messages"
import { splitId } from "./names"
import { placedSchema } from "./placed"
import { PageSchema } from "./schema/page"
import { writtenValues } from "./theme"
import { type Warning, warning } from "./warnings"

// フィールドの形 field が、値の並び values をそれぞれ受け、ほかの字を受けないか（列挙の値がちょうど values か）
const takesExactly = (field: unknown, values: readonly string[]): boolean =>
  field instanceof z.ZodEnum &&
  values.every(v => field.safeParse(v).success) &&
  (field.options as readonly unknown[]).length === values.length

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

const byId = <T extends { id: string }>(defs: readonly T[]) => new Map<string, T>(defs.map(d => [d.id, d]))

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

// ページのタイプのデータの形（組み立てたもの）
export function pageSchema(catalog: CoreCatalog, id: string): z.ZodObject {
  return catalog.pageSchemas.get(id) ?? fail("E101", { id })
}

// ページのタイプは、データのタイプが表に無ければ error。ほかの定義は catalog.items.get(id) などで引き、知らない id なら undefined
// （データに残った、外したプラグインのアイテムなど）
export function pageType(catalog: CoreCatalog, id: string): PageTypeDef {
  return catalog.pageTypes.get(id) ?? fail("E101", { id })
}

const allMessages = (parts: CoreCatalogParts) => [CORE_MESSAGES, ...parts.messages]
const allLanguages = (parts: CoreCatalogParts) => [...LANGUAGES, ...parts.languages]

// 文言の鍵 → 言語ごとの訳。プラグインの文言の訳に、言語パックの訳を重ねる（パックが勝つ）。インスタンスに無い鍵のパックの訳は使わない
function mergeMessages(parts: CoreCatalogParts): Messages {
  const messages = new Map<string, Readonly<Record<Lang, string>>>()
  for (const set of allMessages(parts))
    for (const [key, t] of Object.entries(set.messages)) messages.set(key, { ...messages.get(key), ...t })
  for (const pack of allLanguages(parts))
    for (const [key, text] of Object.entries(pack.messages)) {
      const known = messages.get(key)
      if (known && text !== undefined) messages.set(key, { ...known, [pack.lang]: text })
    }
  return messages
}

// 宣言されたテーマキーと、宣言した物（アイテムとページのタイプは自分の id、プラグインのテーマキーはプラグインの id）
const tokenDefs = (parts: CoreCatalogParts) => [
  ...[...parts.pageTypes, ...parts.items].flatMap(d => d.tokens.map(k => ({ owner: d.id, ...k }))),
  ...parts.tokens.map(k => ({ owner: splitId(k.id).owner ?? k.id, ...k })),
]

// 明暗で同じ値だけのテーマキー（shades: "one"）に、明暗で違う値を書いたテーマ（warning は書いた者のもの。writtenValues の by）
const shadeWarnings = (parts: CoreCatalogParts): Warning[] => {
  const one = tokenDefs(parts).filter(d => "value" in d && d.shades === "one")
  return parts.themes.flatMap(t =>
    one.flatMap(def =>
      writtenValues(t, def).flatMap(({ value: set, by }) => {
        if (typeof set === "string" || set.light === undefined || set.dark === undefined) return []
        if (set.light === set.dark) return []
        return [warning("W020", by, { theme: t.id, token: def.id, light: set.light, dark: set.dark })]
      }),
    ),
  )
}

// 定義の組の食い違いを返す（無ければ空）。文は problemText で、直す所が分かる形になる
// タイプの actions の、効かない行: without に付いていないアクション（W001）、add にすでに付いているアクション（W002）。warning はタイプのプラグインのもの。
// 道具の performs の、表に無いアクション（W012。その行だけ効かない）。warning は道具のプラグインのもの。
// コントロールセンターの fixedUserSettings の、利用者の設定の項目でない id（W013。その行だけ効かない）。
// 明暗で同じ値だけのテーマキーに明暗で違う値を書いたテーマ（W020）
function coreWarnings(parts: CoreCatalogParts): Warning[] {
  const actions = byId(parts.actions)
  const userSettings = byId(parts.userSettings)
  const tools = parts.tools.flatMap(tool =>
    (tool.performs ?? [])
      .filter(a => !actions.has(a))
      .map(a => warning("W012", splitId(tool.id).owner ?? "", { tool: tool.id, action: a })),
  )
  const enums = byId(parts.enums)
  return [
    ...tools,
    ...shadeWarnings(parts),
    ...parts.enumValues
      .filter(v => !enums.has(v.enum))
      .map(v => warning("W026", splitId(v.id).owner ?? "", { id: v.id, enum: v.enum })),
    ...parts.pageTypes.flatMap(t => {
      const plugin = splitId(t.id).owner ?? ""
      const attached = (id: string) => {
        const a = actions.get(id)
        return a !== undefined && attachedTo(a, t)
      }
      return [
        ...(t.actions.without ?? [])
          .filter(id => !attached(id) && !(t.actions.add ?? []).includes(id))
          .map(id => warning("W001", plugin, { type: t.id, action: id })),
        ...(t.actions.add ?? []).filter(attached).map(id => warning("W002", plugin, { type: t.id, action: id })),
      ]
    }),
    ...parts.controlCenters.flatMap(c =>
      (c.fixedUserSettings ?? [])
        .filter(id => !userSettings.has(id))
        .map(id => warning("W013", splitId(c.id).owner ?? "", { controlCenter: c.id, setting: id })),
    ),
  ]
}

export function checkCoreCatalog(parts: CoreCatalogParts): Problem[] {
  const problems: Problem[] = []
  const papers = byId(parts.papers)
  const items = byId(parts.items)
  const actions = byId(parts.actions)
  const settings = byId(parts.settings)
  const themes = byId(parts.themes)
  for (const k of partsOf("core")) {
    const seen = new Set<string>()
    for (const d of parts[k] as readonly { id: string }[]) {
      if (seen.has(d.id)) problems.push(problem("E001", { kind: PARTS[k].label, id: d.id }))
      seen.add(d.id)
    }
  }
  // ブックの設定の項目と利用者の設定の項目は、同じ id を持たない。role と userOnly は利用者の設定の項目だけが持ち、1 つの role は 1 つの項目だけ
  for (const d of parts.userSettings)
    if (settings.has(d.id)) problems.push(problem("E001", { kind: PARTS.settings.label, id: d.id }))
  for (const d of parts.settings)
    for (const field of ["role", "userOnly"] as const)
      if (d[field] !== undefined) problems.push(problem("E036", { id: d.id, field }))
  const roles = new Map<SettingRole, string>()
  for (const d of parts.userSettings) {
    if (!d.role) continue
    const other = roles.get(d.role)
    if (other !== undefined) problems.push(problem("E037", { id: d.id, role: d.role, other }))
    roles.set(d.role, d.id)
  }
  // AI が参加を頼むときの役（runsWhenAIJoins）も、1 つの役は 1 つのアクションだけが名乗る
  const joinRoles = new Map<string, string>()
  for (const a of parts.actions) {
    if (!a.runsWhenAIJoins) continue
    const other = joinRoles.get(a.runsWhenAIJoins)
    if (other !== undefined) problems.push(problem("E044", { id: a.id, role: a.runsWhenAIJoins, other }))
    joinRoles.set(a.runsWhenAIJoins, a.id)
  }
  // 参加者のセッションが終わったときの役（runsWhenAIEnds）も、1 つのアクションだけが名乗る
  let ender: string | undefined
  for (const a of parts.actions) {
    if (!a.runsWhenAIEnds) continue
    if (ender !== undefined) problems.push(problem("E070", { id: a.id, other: ender }))
    ender ??= a.id
  }
  for (const [kind, defs] of [
    ["messages", allMessages(parts)],
    ["language", allLanguages(parts)],
  ] as const) {
    const seen = new Set<string>()
    for (const d of defs) {
      if (seen.has(d.id)) problems.push(problem("E001", { kind, id: d.id }))
      seen.add(d.id)
    }
  }
  // 窓を開いたときのスクリーンアレンジメントは 1 つだけ
  const atStart = parts.screenArrangements.filter(a => a.atStart)
  for (const a of atStart.slice(1)) problems.push(problem("E054", { id: a.id, other: atStart[0]?.id ?? "" }))
  // ステージを並べるスクリーンの定義（ブックスクリーン）は 1 つだけ（窓は、その定義から何枚でも開く）
  const staged = parts.screens.filter(d => d.stages)
  for (const d of staged.slice(1)) problems.push(problem("E055", { id: d.id, other: staged[0]?.id ?? "" }))
  const subjects = new Set<string>(parts.subjects.map(s => s.id))
  const subjectDefs = new Map(parts.subjects.map(s => [s.id, s]))
  for (const s of parts.subjects)
    if (!(s.record.shape.id instanceof z.ZodString)) problems.push(problem("E045", { id: s.id }))
  const roleOwner = new Map<string, string>()
  for (const s of parts.subjects) {
    if (!s.role) continue
    const other = roleOwner.get(s.role)
    if (other) problems.push(problem("E050", { id: s.id, role: s.role, other }))
    else roleOwner.set(s.role, s.id)
    for (const field of SUBJECT_ROLE_FIELDS[s.role])
      if (!(field in s.record.shape)) problems.push(problem("E051", { id: s.id, role: s.role, field }))
    // 参加者の state は、常駐が読む値（PARTICIPANT_STATES）をそれぞれ受け、ほかを受けない
    if (s.role === "participants" && !takesExactly(s.record.shape.state, PARTICIPANT_STATES))
      problems.push(problem("E130", { id: s.id, states: PARTICIPANT_STATES.join(", ") }))
  }
  // 列挙の値の data は、宣言の value の形に合う（宣言が無い値は error にせず、効かない warning にする）
  const enumTables = { enums: byId(parts.enums), enumValues: byId(parts.enumValues) }
  for (const e of parts.enums)
    for (const v of enumValuesOf(enumTables, e.id))
      if (!e.value.safeParse(v.data).success) problems.push(problem("E053", { id: v.id, enum: e.id }))
  for (const a of parts.actions)
    if (!BASE_TARGETS.includes(a.target) && !subjects.has(a.target))
      problems.push(problem("E046", { id: a.id, target: a.target }))
  // アクションの対象と writes に書ける種類は、アクションと同じプラグインの種類か、持ち主が writableBy に許した種類。writes は、台帳にある種類で、対象でなく、番号を振る種類でない
  const numbered = new Set(parts.subjects.filter(s => s.numbered).map(s => s.id))
  for (const a of parts.actions) {
    const owner = splitId(a.id).owner
    for (const ref of [a.target, ...(a.writes ?? [])]) {
      const def = subjectDefs.get(ref)
      if (def && splitId(ref).owner !== owner && !(owner !== null && def.writableBy?.includes(owner)))
        problems.push(problem("E058", { id: a.id, ref }))
    }
    for (const ref of a.writes ?? []) {
      if (!subjects.has(ref)) problems.push(problem("E056", { id: a.id, ref }))
      else if (ref === a.target) problems.push(problem("E057", { id: a.id, target: a.target }))
      else if (numbered.has(ref)) problems.push(problem("E059", { id: a.id, ref }))
    }
    if (a.lockSwitch && (a.writes?.length ?? 0) > 0) problems.push(problem("E060", { id: a.id }))
  }
  for (const s of parts.subjects) if (s.aiListed && s.aiList) problems.push(problem("E061", { id: s.id }))
  for (const c of parts.controlCenters) {
    for (const id of c.actions) if (!actions.has(id)) problems.push(problem("E041", { id: c.id, ref: id }))
    for (const id of c.subjects === "all" ? [] : (c.subjects ?? []))
      if (!subjects.has(id)) problems.push(problem("E047", { id: c.id, ref: id }))
  }
  // ページ・ブックの設定の項目は持つ所（holder）を書き、利用者の設定の項目は書かない（書き違えると、どこにも持たれない項目になる）
  for (const d of parts.settings) if (d.holder === undefined) problems.push(problem("E064", { id: d.id }))
  for (const d of parts.userSettings) if (d.holder !== undefined) problems.push(problem("E065", { id: d.id }))
  // 許可スコープが "book" のアクションは、ページを名指さないので、ページのタイプで決まる付く先（items・presentations・annotations）を持てない
  for (const a of parts.actions)
    if (a.target === "book" && a.permissionScope === "book" && a.attach) {
      const typed = (["items", "presentations", "annotations"] as const).filter(k => a.attach?.[k] !== undefined)
      if (typed.length > 0) problems.push(problem("E063", { id: a.id, attach: typed.join(", ") }))
    }
  // ブック自身だけを変えるアクション（許可スコープが "book"）は、どのページのタイプでも決まらないので、タイプは足せも外せもしない
  for (const t of parts.pageTypes)
    for (const field of ["add", "without"] as const)
      for (const id of t.actions[field] ?? []) {
        const a = actions.get(id)
        if (a?.target === "book" && a.permissionScope === "book")
          problems.push(problem("E066", { id: t.id, field, action: id }))
      }
  for (const t of parts.pageTypes) {
    for (const id of t.settings ?? []) {
      const def = settings.get(id)
      if (!def) problems.push(problem("E008", { id: t.id, kind: "setting", ref: id }))
      else if (def.holder !== "page") problems.push(problem("E062", { id: t.id, setting: id }))
    }
    const rule = t.paper
    for (const id of rule.allowed) if (!papers.has(id)) problems.push(problem("E004", { id: t.id, paper: id }))
    if (!rule.allowed.includes(rule.default)) problems.push(problem("E005", { id: t.id, paper: rule.default }))
    // lineup は、エントリのうちバインダだけが持つ名前（置き直しの Patch が、この名前でバインダを見分ける）
    for (const field of [...Object.keys(PageSchema.shape), "items", "slide", "settings", "lineup"])
      if (field in (t.fields ?? {})) problems.push(problem("E030", { id: t.id, field }))
    for (const id of t.items.allowed)
      if (!items.has(id)) problems.push(problem("E008", { id: t.id, kind: "item", ref: id }))
    for (const id of t.slide?.allowed ?? []) {
      const def = items.get(id)
      if (!def) problems.push(problem("E008", { id: t.id, kind: "item", ref: id }))
      else if (def.kind !== "shape") problems.push(problem("E042", { id: t.id, ref: id }))
    }
    for (const id of Object.keys(t.items.options ?? {}))
      if (!t.items.allowed.includes(id)) problems.push(problem("E029", { id: t.id, ref: id }))
    for (const id of t.actions.add ?? [])
      if (!actions.has(id)) problems.push(problem("E008", { id: t.id, kind: "action", ref: id }))
    if (!themes.has(t.theme)) problems.push(problem("E010", { id: t.id, theme: t.theme }))
    if (!parts.presentations.some(p => p.id === t.presentation))
      problems.push(problem("E008", { id: t.id, kind: "presentation", ref: t.presentation }))
    if (t.tools !== undefined && !parts.toolSets.some(s => s.id === t.tools))
      problems.push(problem("E008", { id: t.id, kind: "toolSet", ref: t.tools }))
  }
  const tools = byId(parts.tools)
  for (const s of parts.toolSets) {
    if (s.tools.length === 0) problems.push(problem("E033", { id: s.id }))
    for (const tool of s.tools) if (!tools.has(tool)) problems.push(problem("E032", { id: s.id, tool }))
  }
  const defs = tokenDefs(parts)
  const declared = new Set<string>()
  for (const d of defs) {
    if (declared.has(d.id)) problems.push(problem("E011", { owner: d.owner, token: d.id }))
    declared.add(d.id)
    if ("fallback" in d && !(THEME_TOKENS as readonly string[]).includes(d.fallback))
      problems.push(problem("E012", { owner: d.owner, token: d.id, fallback: d.fallback }))
  }
  for (const p of parts.papers) if (p.size.w > p.size.h) problems.push(problem("E014", { id: p.id }))
  for (const c of parts.textColors) if (!HEX.test(c.color)) problems.push(problem("E034", { id: c.id, color: c.color }))
  for (const s of parts.skins)
    for (const [role, color] of Object.entries(s.palette ?? {}))
      if (!HEX.test(color)) problems.push(problem("E052", { id: s.id, role, color }))
  // 同じ鍵の同じ言語に違う訳を持つ文言（プラグインの文言どうし・言語パックどうし）、名前の違う同じ言語、文言の表に無い名前
  const messages = new Map<string, Record<Lang, string>>()
  for (const set of allMessages(parts))
    for (const [key, t] of Object.entries(set.messages)) {
      const known = (messages.get(key) ?? messages.set(key, {}).get(key)) as Record<Lang, string>
      for (const [lang, text] of Object.entries(t)) {
        if (known[lang] !== undefined && known[lang] !== text) problems.push(problem("E017", { key, lang }))
        known[lang] = text
      }
    }
  const names = new Map<Lang, string>()
  const packed = new Map<string, string>()
  for (const pack of allLanguages(parts)) {
    const name = names.get(pack.lang)
    if (name !== undefined && name !== pack.name) problems.push(problem("E020", { lang: pack.lang }))
    names.set(pack.lang, pack.name)
    for (const [key, text] of Object.entries(pack.messages)) {
      const seen = packed.get(`${pack.lang}\n${key}`)
      if (seen !== undefined && seen !== text) problems.push(problem("E021", { key, lang: pack.lang }))
      packed.set(`${pack.lang}\n${key}`, text as string)
    }
  }
  // 題名を持つ定義の種類は、PARTS の一覧から決める
  for (const k of partsOf("core"))
    for (const d of parts[k] as readonly { id: string; title?: unknown }[])
      if (typeof d.title === "string" && !messages.has(d.title))
        problems.push(problem("E018", { kind: PARTS[k].label, id: d.id, title: d.title }))
  return problems
}
