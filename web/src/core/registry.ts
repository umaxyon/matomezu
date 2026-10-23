// 登録表: ブックのタイプ・アイテム・アクション・設定の項目・テーマ・紙の表。定義の組（RegistryParts）から buildRegistry で作り、作った後は変えない。
// 表どうしの参照（ブックのタイプが使うアイテムなど）が実在するかは checkRegistry が確かめ、食い違いがあれば作らない。
// ブックのデータの形は、ブックのタイプが自分で持つ欄に、タイプが選んだものから組み立てた欄（ページと、そこに置けるアイテム・設定の項目）を足して作る（buildBookSchemas）

import { z } from "zod"
import type { ActionDef } from "./def/action"
import type { BookTypeDef } from "./def/book-type"
import type { ItemDef } from "./def/item"
import type { PaperDef } from "./def/paper"
import type { SettingDef } from "./def/setting"
import type { SkinDef } from "./def/skin"
import { THEME_TOKENS, type ThemeDef } from "./def/theme"
import { fail, matomezuError, type Problem, problem } from "./errors"
import type { Messages } from "./i18n/i18n"
import { LANGUAGES, type Lang, type LanguagePack, MESSAGES, type MessageSet } from "./i18n/messages"
import { placedSchema } from "./placed"
import { PageSchema } from "./schema/page"
import type { ItemId, ItemTable } from "./tables"

export type { ActionId, BookTypeId, ItemId, PaperId, SettingId, SkinId, ThemeId } from "./tables"

// アイテムの、置いたものが持つ項目の型
export type ItemProps<K extends ItemId> = z.infer<ItemTable[K]["props"]>

// 表を作るもとの、定義の組
export interface RegistryParts {
  bookTypes: readonly BookTypeDef[]
  items: readonly ItemDef[]
  actions: readonly ActionDef[]
  settings: readonly SettingDef[]
  themes: readonly ThemeDef[]
  papers: readonly PaperDef[]
  skins: readonly SkinDef[] // アプリの枠の見た目（見る人の設定で選ぶ）
  messages: readonly MessageSet[] // 土台の文言（MESSAGES）は、いつも表に入る
  languages: readonly LanguagePack[] // 土台の言語（LANGUAGES: 英語と日本語）は、いつも表に入る
}

// ブックのタイプごとに組み立てたデータの形（ページを持たないタイプは page が null）
export interface BookSchemas {
  book: z.ZodObject
  page: z.ZodObject | null
}

// 作った表。id で引く。bookSchema は、表のブックのタイプの形を 1 つに束ねた、ブックのデータの形
export interface Registry {
  parts: RegistryParts
  bookTypes: ReadonlyMap<string, BookTypeDef>
  schemas: ReadonlyMap<string, BookSchemas>
  items: ReadonlyMap<string, ItemDef>
  actions: ReadonlyMap<string, ActionDef>
  settings: ReadonlyMap<string, SettingDef>
  themes: ReadonlyMap<string, ThemeDef>
  papers: ReadonlyMap<string, PaperDef>
  skins: ReadonlyMap<string, SkinDef>
  messages: Messages
  languages: ReadonlyMap<Lang, string> // app で選べる言語の id → 名前（土台の言語が先、あとはパックの順）
  bookSchema: z.ZodType
}

const byId = <T extends { id: string }>(defs: readonly T[]) => new Map<string, T>(defs.map(d => [d.id, d]))

// 食い違いがあれば、直す所が分かる文を並べて誤りにする
export function buildRegistry(parts: RegistryParts): Registry {
  const problems = checkRegistry(parts)
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const schemas = new Map(parts.bookTypes.map(t => [t.id, buildBookSchemas(parts, t)]))
  const [first, ...rest] = [...schemas.values()].map(s => s.book)
  if (!first) return fail("E015")
  return {
    parts,
    bookTypes: byId(parts.bookTypes),
    schemas,
    items: byId(parts.items),
    actions: byId(parts.actions),
    settings: byId(parts.settings),
    themes: byId(parts.themes),
    papers: byId(parts.papers),
    skins: byId(parts.skins),
    messages: mergeMessages(parts),
    languages: new Map(allLanguages(parts).map(p => [p.lang, p.name])),
    bookSchema: z.discriminatedUnion("type", [first, ...rest]),
  }
}

// ブックが自分の欄の後ろに持つ欄の前の、頭の欄（ここまでの後ろにページと設定の項目の欄を入れる。保存したデータの欄の並びを変えない）
const HEAD = ["type", "id", "title"]

// タイプのブックとページのデータの形: ページの形は、土台のページの欄・タイプが選んだアイテムを置いた並び（items）・ページの設定の項目。
// ブックの形は、タイプの頭の欄・ページの並び（pages）・ブックの設定の項目・タイプのほかの欄
function buildBookSchemas(parts: RegistryParts, t: BookTypeDef): BookSchemas {
  const settings = byId(parts.settings)
  const fields = (ids: readonly string[] = []) =>
    Object.fromEntries(ids.flatMap(id => settings.get(id) ?? []).map(d => [d.field, d.schema.optional()]))
  const items = byId(parts.items)
  const placed = t.items.allowed.flatMap(id => items.get(id) ?? []).map(placedSchema)
  const [one, ...more] = placed
  const page = t.pages
    ? PageSchema.extend({
        items: z.array(one ? z.discriminatedUnion("item", [one, ...more]) : z.never()).optional(),
        ...fields(t.settings?.page),
      })
    : null
  const own = Object.entries(t.schema.shape)
  const head = own.filter(([k]) => HEAD.includes(k))
  const tail = own.filter(([k]) => !HEAD.includes(k))
  const book = z.strictObject({
    ...Object.fromEntries(head),
    ...(page ? { pages: z.array(page) } : {}),
    ...fields(t.settings?.book),
    ...Object.fromEntries(tail),
  })
  return { book, page }
}

// ブックのタイプのデータの形（組み立てたもの）
export function bookSchemas(reg: Registry, id: string): BookSchemas {
  return reg.schemas.get(id) ?? fail("E101", { id })
}

// ブックのタイプは、データのタイプが表に無ければ誤り。ほかの定義は reg.items.get(id) などで引き、知らない id なら undefined
// （データに残った、外したプラグインのアイテムなど）
export function bookType(reg: Registry, id: string): BookTypeDef {
  return reg.bookTypes.get(id) ?? fail("E101", { id })
}

const allMessages = (parts: RegistryParts) => [MESSAGES, ...parts.messages]
const allLanguages = (parts: RegistryParts) => [...LANGUAGES, ...parts.languages]

// 文言の鍵 → 言語ごとの訳。プラグインの文言の訳に、言語パックの訳を重ねる（パックが勝つ）。app に無い鍵のパックの訳は使わない
function mergeMessages(parts: RegistryParts): Messages {
  const messages = new Map<string, Readonly<Record<Lang, string>>>()
  for (const set of allMessages(parts))
    for (const [key, t] of Object.entries(set)) messages.set(key, { ...messages.get(key), ...t })
  for (const pack of allLanguages(parts))
    for (const [key, text] of Object.entries(pack.messages)) {
      const known = messages.get(key)
      if (known && text !== undefined) messages.set(key, { ...known, [pack.lang]: text })
    }
  return messages
}

// 定義の組の食い違いを返す（無ければ空）。文は problemText で、直す所が分かる形になる
export function checkRegistry(parts: RegistryParts): Problem[] {
  const problems: Problem[] = []
  const papers = byId(parts.papers)
  const items = byId(parts.items)
  const actions = byId(parts.actions)
  const settings = byId(parts.settings)
  const themes = byId(parts.themes)
  const tables = {
    bookType: parts.bookTypes,
    item: parts.items,
    action: parts.actions,
    setting: parts.settings,
    theme: parts.themes,
    paper: parts.papers,
    skin: parts.skins,
  }
  for (const [name, defs] of Object.entries(tables)) {
    const seen = new Set<string>()
    for (const d of defs as readonly { id: string }[]) {
      if (seen.has(d.id)) problems.push(problem("E001", { kind: name, id: d.id }))
      seen.add(d.id)
    }
  }
  for (const t of parts.bookTypes) {
    const literal = t.schema.shape.type
    // id だけを通す形か（ほかの文字も通すなら literal ではない）
    if (literal?.safeParse(t.id).success !== true || literal.safeParse(`${t.id}-other`).success)
      problems.push(problem("E002", { id: t.id }))
    const added = [
      "pages",
      ...[...(t.settings?.book ?? []), ...(t.settings?.page ?? [])].flatMap(id => settings.get(id)?.field ?? []),
    ]
    for (const field of added) if (field in t.schema.shape) problems.push(problem("E025", { id: t.id, field }))
    for (const id of [...(t.settings?.book ?? []), ...(t.settings?.page ?? [])])
      if (!settings.has(id)) problems.push(problem("E008", { id: t.id, kind: "setting", ref: id }))
    if (t.pages) {
      const rule = t.pages.paper
      for (const id of rule.allowed) if (!papers.has(id)) problems.push(problem("E004", { id: t.id, paper: id }))
      if (!rule.allowed.includes(rule.default)) problems.push(problem("E005", { id: t.id, paper: rule.default }))
    }
    if (t.pages?.addFromTabs && !t.actions.defaults.includes("page.add")) problems.push(problem("E006", { id: t.id }))
    const built = buildBookSchemas(parts, t).book
    if (t.single && (t.book.id !== t.id || !built.safeParse(t.book).success))
      problems.push(problem("E019", { id: t.id }))
    if (!t.single && !built.safeParse(t.create({ id: "check", title: "check" })).success)
      problems.push(problem("E007", { id: t.id }))
    for (const [kind, choice, table] of [
      ["item", t.items, items],
      ["action", t.actions, actions],
    ] as const) {
      for (const id of choice.allowed) if (!table.has(id)) problems.push(problem("E008", { id: t.id, kind, ref: id }))
      for (const id of choice.defaults)
        if (!choice.allowed.includes(id)) problems.push(problem("E009", { id: t.id, kind, ref: id }))
    }
    if (!themes.has(t.theme)) problems.push(problem("E010", { id: t.id, theme: t.theme }))
  }
  const decls = [...parts.bookTypes, ...parts.items].flatMap(d => d.tokens.map(k => ({ owner: d.id, ...k })))
  const declared = new Set<string>()
  for (const d of decls) {
    if (declared.has(d.id)) problems.push(problem("E011", { owner: d.owner, token: d.id }))
    declared.add(d.id)
    if ("fallback" in d && !(THEME_TOKENS as readonly string[]).includes(d.fallback))
      problems.push(problem("E012", { owner: d.owner, token: d.id, fallback: d.fallback }))
  }
  for (const th of parts.themes)
    for (const id of Object.keys(th.tokens ?? {}))
      if (!declared.has(id)) problems.push(problem("E013", { id: th.id, token: id }))
  for (const p of parts.papers) if (p.size.w > p.size.h) problems.push(problem("E014", { id: p.id }))
  const fieldOwner = new Map<string, string>()
  for (const d of parts.settings) {
    if (fieldOwner.has(d.field)) problems.push(problem("E027", { id: d.id, field: d.field }))
    fieldOwner.set(d.field, d.id)
  }
  // 同じ鍵の同じ言語に違う訳を持つ文言（プラグインの文言どうし・言語パックどうし）、名前の違う同じ言語、文言の表に無い名前
  const messages = new Map<string, Record<Lang, string>>()
  for (const set of allMessages(parts))
    for (const [key, t] of Object.entries(set)) {
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
  const named = [
    ["bookType", parts.bookTypes],
    ["item", parts.items],
    ["action", parts.actions],
    ["setting", parts.settings],
    ["theme", parts.themes],
    ["paper", parts.papers],
    ["skin", parts.skins],
  ] as const
  for (const [kind, defs] of named)
    for (const d of defs as readonly { id: string; title: string }[])
      if (!messages.has(d.title)) problems.push(problem("E018", { kind, id: d.id, title: d.title }))
  return problems
}
