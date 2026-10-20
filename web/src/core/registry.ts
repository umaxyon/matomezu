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
import { fail, matomezuError, type Problem, problem } from "./errors"
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
  if (problems.length > 0) throw matomezuError(problem("E016", { count: problems.length }), problems)
  const [first, ...rest] = parts.bookTypes.map(t => t.schema)
  if (!first) return fail("E015")
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

// ブックのタイプは、データのタイプが表に無ければ誤り。ほかの定義は reg.items.get(id) などで引き、知らない id なら undefined
// （データに残った、外したプラグインのアイテムなど）
export function bookType(reg: Registry, id: string): BookTypeDef {
  return reg.bookTypes.get(id) ?? fail("E101", { id })
}

// 定義の組の食い違いを返す（無ければ空）。文は problemText で、直す所が分かる形になる
export function checkRegistry(parts: RegistryParts): Problem[] {
  const problems: Problem[] = []
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
      if (seen.has(d.id)) problems.push(problem("E001", { kind: name, id: d.id }))
      seen.add(d.id)
    }
  }
  for (const t of parts.bookTypes) {
    const literal = t.schema.shape.type
    // id だけを通す形か（ほかの文字も通すなら literal ではない）
    if (literal?.safeParse(t.id).success !== true || literal.safeParse(`${t.id}-other`).success)
      problems.push(problem("E002", { id: t.id }))
    if ((t.pages !== null) !== "pages" in t.schema.shape) problems.push(problem("E003", { id: t.id }))
    if (t.pages) {
      const rule = t.pages.paper
      for (const id of rule.allowed) if (!papers.has(id)) problems.push(problem("E004", { id: t.id, paper: id }))
      if (!rule.allowed.includes(rule.default)) problems.push(problem("E005", { id: t.id, paper: rule.default }))
    }
    if (t.pages?.addFromTabs && !t.actions.defaults.includes("page.add")) problems.push(problem("E006", { id: t.id }))
    if (!t.single && !t.schema.safeParse(t.create({ id: "check", title: "check" })).success)
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
    if (!(THEME_TOKENS as readonly string[]).includes(d.fallback))
      problems.push(problem("E012", { owner: d.owner, token: d.id, fallback: d.fallback }))
  }
  for (const th of parts.themes)
    for (const id of Object.keys(th.tokens ?? {}))
      if (!declared.has(id)) problems.push(problem("E013", { id: th.id, token: id }))
  for (const p of parts.papers) if (p.size.w > p.size.h) problems.push(problem("E014", { id: p.id }))
  return problems
}
