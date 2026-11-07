// テーマタイプ（base の book-look/theme-types.ts）: タイプが選べるテーマは、"all" のテーマと、テーマタイプが重なるテーマ。既定のテーマが選べなければ E039、テーマタイプを書いていなければ E040
import { expect, test } from "bun:test"
import { settingSchema } from "../../web/src/core/settings"
import { BUILTIN } from "../../web/src/plugins"
import { BOOK_THEME, themeFits, themesFor } from "../../web/src/plugins/base"
import { assemble, type Plugin } from "../../web/src/store/plugin"
import { CORE_CATALOG } from "../support"

const ids = (type: string) => themesFor(CORE_CATALOG, type).map(t => t.id)

test("図のタイプは all と図のテーマを、マークダウンは all と文書のテーマを、テーマタイプを使わないマスターは all のテーマだけを選べる", () => {
  expect(ids("@matomezu/drawing:drawing")).toEqual([
    "@matomezu/base:standard",
    "@matomezu/base:sticky",
    "@matomezu/base:simple",
    "@matomezu/base:matomezu",
  ])
  expect(ids("@matomezu/markdown:markdown")).toEqual(["@matomezu/base:standard", "@matomezu/markdown:github-like"])
  expect(ids("@matomezu/master:master")).toEqual(["@matomezu/base:standard"])
  expect(themeFits(CORE_CATALOG, "@matomezu/drawing:drawing", "@matomezu/markdown:github-like")).toBe(false)
  expect(themeFits(CORE_CATALOG, "@matomezu/drawing:drawing", "nope")).toBe(false)
})

test("ブックのテーマの項目の値の形は、ブックのタイプが選べるテーマだけ（利用者の設定の項目として組み立てれば、全部のテーマ）", () => {
  const drawing = settingSchema(CORE_CATALOG, BOOK_THEME, { bookType: "@matomezu/drawing:drawing" })
  expect(drawing.safeParse("@matomezu/base:sticky").success).toBe(true)
  expect(drawing.safeParse("@matomezu/markdown:github-like").success).toBe(false)
  const markdown = settingSchema(CORE_CATALOG, BOOK_THEME, { bookType: "@matomezu/markdown:markdown" })
  expect(markdown.safeParse("@matomezu/markdown:github-like").success).toBe(true)
  expect(markdown.safeParse("@matomezu/base:sticky").success).toBe(false)
})

// base のプラグインのテーマとタイプを変えた組み立ての error の番号
function codes(change: (p: Plugin) => Plugin): string[] {
  try {
    assemble((BUILTIN as readonly Plugin[]).map(change))
    return []
  } catch (e) {
    return ((e as { details?: { code: string }[] }).details ?? []).map(p => p.code)
  }
}

test("追加プラグインが足したテーマタイプも重なりで選ぶ（足したテーマタイプだけのテーマは、それを使うタイプだけが選べる）", () => {
  const plugins = (BUILTIN as readonly Plugin[]).map(p =>
    p.id === "@matomezu/markdown"
      ? {
          ...p,
          themes: (p.themes ?? []).map(t => ({ ...t, types: ["@ex/slide:slide"] as never })),
          bookTypes: (p.bookTypes ?? []).map(t => ({
            ...t,
            themeTypes: ["@matomezu/base:document", "@ex/slide:slide"] as never,
          })),
        }
      : p,
  )
  const catalog = assemble(plugins).catalog.core
  expect(themesFor(catalog, "@matomezu/markdown:markdown").map(t => t.id)).toEqual([
    "@matomezu/base:standard",
    "@matomezu/markdown:github-like",
  ])
  expect(themeFits(catalog, "@matomezu/drawing:drawing", "@matomezu/markdown:github-like")).toBe(false)
})

test("タイプの既定のテーマが、そのタイプの選べるテーマでなければ E039。テーマタイプを書いていないテーマ・タイプは E040", () => {
  expect(
    codes(p =>
      p.id === "@matomezu/markdown"
        ? { ...p, bookTypes: (p.bookTypes ?? []).map(t => ({ ...t, theme: "@matomezu/base:sticky" })) }
        : p,
    ),
  ).toEqual(["E039"])
  expect(
    codes(p =>
      p.id === "@matomezu/markdown"
        ? { ...p, themes: (p.themes ?? []).map(t => ({ ...t, types: undefined as never })) }
        : p,
    ),
  ).toEqual(["E040"])
})
