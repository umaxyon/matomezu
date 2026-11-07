// テーマタイプ: テーマがどのブックのタイプ向けか（図・文書など）。テーマは向くテーマタイプを書き（どのタイプにも向くテーマは "all"）、ブックのタイプは使うテーマタイプを書く。
// タイプのブックと、その中の形に選べるテーマは、"all" のテーマと、テーマタイプが 1 つでも重なるテーマ（themesFor）。選べないテーマは選ばせず（ダイアログ）、アクションは断り、
// データに残っていても使わない（表に無いテーマと同じく、タイプの既定のテーマかブックのテーマで描く。データは消さない）

import type { ThemeType } from "../../../core/catalog"
import type { CatalogCheck, CoreCatalog } from "../../../core/core-catalog"
import type { ThemeDef } from "../../../core/def/theme"
import { problem } from "../../../core/errors"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface ThemeTypeTable {
    "@matomezu/base:diagram": true // 図（紙に形を置くブック）
    "@matomezu/base:document": true // 文書（マークダウンなど、文を書くブック）
  }
  interface ThemeExtras {
    types: "all" | readonly ThemeType[] // 向くテーマタイプ（"all" はどのタイプにも向く）
  }
  interface BookTypeExtras {
    themeTypes: readonly ThemeType[] // 使うテーマタイプ（空なら "all" のテーマだけ）
  }
}

export const DIAGRAM_THEMES = kit.name("diagram") satisfies ThemeType
export const DOCUMENT_THEMES = kit.name("document") satisfies ThemeType

// テーマ theme が、テーマタイプ types を使うタイプに向くか
const fits = (theme: ThemeDef, types: readonly string[]) =>
  theme.types === "all" || (Array.isArray(theme.types) && theme.types.some(t => types.includes(t)))

// ブックのタイプ type のブックと、その中の形に選べるテーマ（機能台帳の順。表に無いタイプなら "all" のテーマだけ）
export function themesFor(catalog: CoreCatalog, type: string): ThemeDef[] {
  const types = catalog.bookTypes.get(type)?.themeTypes ?? []
  return [...catalog.themes.values()].filter(t => fits(t, types))
}

// テーマ theme（id）を、ブックのタイプ type のブックと、その中の形に使えるか（表に無いテーマは使えない）
export function themeFits(catalog: CoreCatalog, type: string, theme: string): boolean {
  const def = catalog.themes.get(theme)
  return def !== undefined && fits(def, catalog.bookTypes.get(type)?.themeTypes ?? [])
}

const isTypes = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every(t => typeof t === "string")

// テーマとブックのタイプがテーマタイプを書いているか（E040。型の無い書き方の追加プラグイン向け）と、タイプの既定のテーマが選べるか（E039）。組み立てのときの確かめ
export const THEME_TYPES_CHECK: CatalogCheck = catalog => [
  ...[...catalog.themes.values()].flatMap(t =>
    t.types === "all" || isTypes(t.types)
      ? []
      : [problem("E040", { kind: "theme", id: t.id, expected: '"all" or a list of theme type ids' })],
  ),
  ...[...catalog.bookTypes.values()].flatMap(t =>
    !isTypes(t.themeTypes)
      ? [problem("E040", { kind: "bookType", id: t.id, expected: "a list of theme type ids" })]
      : catalog.themes.has(t.theme) && !themeFits(catalog, t.id, t.theme)
        ? [problem("E039", { id: t.id, theme: t.theme })]
        : [],
  ),
]
