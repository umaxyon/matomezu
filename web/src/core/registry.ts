// 登録表: ブックのタイプ・アイテム・アクション・テーマ・紙の表。定義の組（RegistryParts）から buildRegistry で作り、作った後は変えない。
// 表どうしの参照（ブックのタイプが使うアイテムなど）が実在するかは checkRegistry が確かめ、食い違いがあれば作らない

import { z } from "zod"
import { BOOK_CREATE } from "./actions/book-create"
import { PAGE_ADD } from "./actions/page-add"
import { BOOK_TYPES } from "./book-types"
import type { ActionDef } from "./def/action"
import type { BookTypeDef } from "./def/book-type"
import type { ItemDef } from "./def/item"
import type { PaperDef } from "./def/paper"
import { THEME_TOKENS, type ThemeDef } from "./def/theme"
import { BOX } from "./items/box"
import { PAPERS } from "./papers"
import { STANDARD } from "./themes/standard"

export { BOOK_TYPES, PAPERS }
export const ITEMS = [BOX] as const satisfies readonly ItemDef[]
export const ACTIONS = [PAGE_ADD, BOOK_CREATE] as const satisfies readonly ActionDef[]
export const THEMES = [STANDARD] as const satisfies readonly ThemeDef[]

export type BookTypeId = (typeof BOOK_TYPES)[number]["id"]
export type ItemId = (typeof ITEMS)[number]["id"]
export type ActionId = (typeof ACTIONS)[number]["id"]
export type ThemeId = (typeof THEMES)[number]["id"]

// アイテムの、置いたものが持つ項目の型
export type ItemProps<K extends ItemId> = z.infer<Extract<(typeof ITEMS)[number], { id: K }>["props"]>

// 表を作るもとの、定義の組
export interface RegistryParts {
  bookTypes: readonly BookTypeDef[]
  items: readonly ItemDef[]
  actions: readonly ActionDef[]
  themes: readonly ThemeDef[]
  papers: readonly PaperDef[]
}

// 作った表。id で引く。bookSchema は、表のブックのタイプの形を 1 つに束ねた、ブックのデータの形
export interface Registry {
  parts: RegistryParts
  bookTypes: ReadonlyMap<string, BookTypeDef>
  items: ReadonlyMap<string, ItemDef>
  actions: ReadonlyMap<string, ActionDef>
  themes: ReadonlyMap<string, ThemeDef>
  papers: ReadonlyMap<string, PaperDef>
  bookSchema: z.ZodType
}

const byId = <T extends { id: string }>(defs: readonly T[]) => new Map<string, T>(defs.map(d => [d.id, d]))

// 食い違いがあれば、直す所が分かる文を並べて誤りにする
export function buildRegistry(parts: RegistryParts): Registry {
  const problems = checkRegistry(parts)
  if (problems.length > 0) throw new Error(`registry has problems:\n${problems.join("\n")}`)
  const [first, ...rest] = parts.bookTypes.map(t => t.schema)
  if (!first) throw new Error("registry has no book type")
  return {
    parts,
    bookTypes: byId(parts.bookTypes),
    items: byId(parts.items),
    actions: byId(parts.actions),
    themes: byId(parts.themes),
    papers: byId(parts.papers),
    bookSchema: z.discriminatedUnion("type", [first, ...rest]),
  }
}

// 中の部品の定義の組と、その表
export const BUILTIN_PARTS: RegistryParts = {
  bookTypes: BOOK_TYPES,
  items: ITEMS,
  actions: ACTIONS,
  themes: THEMES,
  papers: PAPERS,
}
export const REGISTRY = buildRegistry(BUILTIN_PARTS)

export function bookType(id: BookTypeId): BookTypeDef {
  const def = REGISTRY.bookTypes.get(id)
  if (!def) throw new Error(`unknown book type: ${id}`)
  return def
}

// 知らない id なら undefined（データに残った、外したプラグインのアイテムなど）
export const itemDef = (id: string): ItemDef | undefined => REGISTRY.items.get(id)
export const actionDef = (id: string): ActionDef | undefined => REGISTRY.actions.get(id)
export const themeDef = (id: string): ThemeDef | undefined => REGISTRY.themes.get(id)

// 定義の組の食い違いを、直す所が分かる文で返す（無ければ空）
export function checkRegistry(parts: RegistryParts): string[] {
  const problems: string[] = []
  const papers = byId(parts.papers)
  const items = byId(parts.items)
  const actions = byId(parts.actions)
  const themes = byId(parts.themes)
  const tables = {
    bookType: parts.bookTypes,
    item: parts.items,
    action: parts.actions,
    theme: parts.themes,
    paper: parts.papers,
  }
  for (const [name, defs] of Object.entries(tables)) {
    const seen = new Set<string>()
    for (const d of defs as readonly { id: string }[]) {
      if (seen.has(d.id)) problems.push(`${name} ${d.id}: id is registered twice`)
      seen.add(d.id)
    }
  }
  for (const t of parts.bookTypes) {
    const where = `bookType ${t.id}`
    const literal = t.schema.shape.type
    // id だけを通す形か（ほかの文字も通すなら literal ではない）
    if (literal?.safeParse(t.id).success !== true || literal.safeParse(`${t.id}-other`).success)
      problems.push(`${where}: schema.type must be the literal "${t.id}"`)
    if ((t.pages !== null) !== "pages" in t.schema.shape)
      problems.push(`${where}: pages must match whether schema has pages`)
    if (t.pages) {
      const rule = t.pages.paper
      for (const id of rule.allowed) if (!papers.has(id)) problems.push(`${where}: unknown paper ${id}`)
      if (!rule.allowed.includes(rule.default)) problems.push(`${where}: default paper ${rule.default} is not allowed`)
    }
    if (t.pages?.addFromTabs && !t.actions.defaults.includes("page.add"))
      problems.push(`${where}: addFromTabs needs page.add in the default actions`)
    if (!t.single && !t.schema.safeParse(t.create({ id: "check", title: "check" })).success)
      problems.push(`${where}: create must return a book of the schema`)
    for (const [kind, choice, table] of [
      ["item", t.items, items],
      ["action", t.actions, actions],
    ] as const) {
      for (const id of choice.allowed) if (!table.has(id)) problems.push(`${where}: unknown ${kind} ${id}`)
      for (const id of choice.defaults)
        if (!choice.allowed.includes(id)) problems.push(`${where}: default ${kind} ${id} is not allowed`)
    }
    if (!themes.has(t.theme)) problems.push(`${where}: unknown theme ${t.theme}`)
  }
  const decls = [...parts.bookTypes, ...parts.items].flatMap(d => d.tokens.map(k => ({ owner: d.id, ...k })))
  const declared = new Set<string>()
  for (const d of decls) {
    if (declared.has(d.id)) problems.push(`${d.owner}: token ${d.id} is declared twice`)
    declared.add(d.id)
    if (!(THEME_TOKENS as readonly string[]).includes(d.fallback))
      problems.push(`${d.owner}: token ${d.id} falls back to unknown ${d.fallback}`)
  }
  for (const th of parts.themes)
    for (const id of Object.keys(th.tokens ?? {}))
      if (!declared.has(id)) problems.push(`theme ${th.id}: token ${id} is not declared by any item or book type`)
  for (const p of parts.papers) if (p.size.w > p.size.h) problems.push(`paper ${p.id}: size must be portrait (w <= h)`)
  return problems
}
