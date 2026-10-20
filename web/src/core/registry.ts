// 登録表: ブックのタイプ・アイテム・アクション・テーマの正本。足すときは、定義のファイルを作ってここの表に 1 行足す（ブックのタイプは book-types/index.ts）。
// 表どうしの参照（ブックのタイプが使うアイテムなど）が実在するかは checkRegistry が確かめる

import type { z } from "zod"
import { BOOK_CREATE } from "./actions/book-create"
import { PAGE_ADD } from "./actions/page-add"
import { BOOK_TYPES } from "./book-types"
import type { ActionDef } from "./def/action"
import type { BookTypeDef } from "./def/book-type"
import type { ItemDef } from "./def/item"
import { THEME_TOKENS, type ThemeDef } from "./def/theme"
import { BOX } from "./items/box"
import { STANDARD } from "./themes/standard"

export { BOOK_TYPES }
export const ITEMS = [BOX] as const satisfies readonly ItemDef[]
export const ACTIONS = [PAGE_ADD, BOOK_CREATE] as const satisfies readonly ActionDef[]
export const THEMES = [STANDARD] as const satisfies readonly ThemeDef[]

export type BookTypeId = (typeof BOOK_TYPES)[number]["id"]
export type ItemId = (typeof ITEMS)[number]["id"]
export type ActionId = (typeof ACTIONS)[number]["id"]
export type ThemeId = (typeof THEMES)[number]["id"]

// アイテムの、置いたものが持つ項目の型
export type ItemProps<K extends ItemId> = z.infer<Extract<(typeof ITEMS)[number], { id: K }>["props"]>

const byId = <T extends { id: string }>(defs: readonly T[]) => new Map<string, T>(defs.map(d => [d.id, d]))
const bookTypes = byId<BookTypeDef>(BOOK_TYPES)
const items = byId<ItemDef>(ITEMS)
const actions = byId<ActionDef>(ACTIONS)
const themes = byId<ThemeDef>(THEMES)

export function bookType(id: BookTypeId): BookTypeDef {
  const def = bookTypes.get(id)
  if (!def) throw new Error(`unknown book type: ${id}`)
  return def
}

// 知らない id なら undefined（データに残った、外したプラグインのアイテムなど）
export const itemDef = (id: string): ItemDef | undefined => items.get(id)
export const actionDef = (id: string): ActionDef | undefined => actions.get(id)
export const themeDef = (id: string): ThemeDef | undefined => themes.get(id)

// 登録表の食い違いを、直す所が分かる文で返す（無ければ空）
export function checkRegistry(): string[] {
  const problems: string[] = []
  const tables = { bookType: BOOK_TYPES, item: ITEMS, action: ACTIONS, theme: THEMES }
  for (const [name, defs] of Object.entries(tables)) {
    const seen = new Set<string>()
    for (const d of defs as readonly { id: string }[]) {
      if (seen.has(d.id)) problems.push(`${name} ${d.id}: id is registered twice`)
      seen.add(d.id)
    }
  }
  for (const t of BOOK_TYPES as readonly BookTypeDef[]) {
    const where = `bookType ${t.id}`
    const literal = t.schema.shape.type
    // id だけを通す形か（ほかの文字も通すなら literal ではない）
    if (literal?.safeParse(t.id).success !== true || literal.safeParse(`${t.id}-other`).success)
      problems.push(`${where}: schema.type must be the literal "${t.id}"`)
    if ((t.pages !== null) !== "pages" in t.schema.shape)
      problems.push(`${where}: pages must match whether schema has pages`)
    if (t.pages && !t.pages.paper.allowed.includes(t.pages.paper.default))
      problems.push(`${where}: default paper ${t.pages.paper.default} is not allowed`)
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
  const decls = [...BOOK_TYPES, ...ITEMS].flatMap(d => d.tokens.map(k => ({ owner: d.id, ...k })))
  const declared = new Set<string>()
  for (const d of decls) {
    if (declared.has(d.id)) problems.push(`${d.owner}: token ${d.id} is declared twice`)
    declared.add(d.id)
    if (!(THEME_TOKENS as readonly string[]).includes(d.fallback))
      problems.push(`${d.owner}: token ${d.id} falls back to unknown ${d.fallback}`)
  }
  for (const th of THEMES as readonly ThemeDef[])
    for (const id of Object.keys(th.tokens ?? {}))
      if (!declared.has(id)) problems.push(`theme ${th.id}: token ${id} is not declared by any item or book type`)
  return problems
}
