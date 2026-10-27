// 機能台帳が組み立てるブックの形: タイプが選んだアイテム・設定の項目・見せ方から作り、選んでいないものは受け付けない
import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { restoreBooks } from "../../web/src/core/book"
import { buildCoreCatalog, checkCoreCatalog } from "../../web/src/core/core-catalog"
import type { BookOf } from "../../web/src/core/schema/book"
import { BUILTIN } from "../../web/src/plugins"
import { settingValue } from "../../web/src/plugins/base/book-settings"
import { assemble, type Plugin } from "../../web/src/store/plugin"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

const drawing = BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/drawing:drawing")!
const withDrawing = (patch: object) => ({
  ...BUILTIN_PARTS,
  bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t.id === "@matomezu/drawing:drawing" ? { ...t, ...patch } : t)),
})
const page = (items: unknown[], extra: object = {}) => ({
  id: "p1",
  title: "P",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
  items,
  ...extra,
})
const book = (pages: unknown[], extra: object = {}) => ({
  type: "@matomezu/drawing:drawing",
  id: "b1",
  title: "T",
  pages,
  ...extra,
})
const box = { id: "n1", x: 10, y: 10, item: "@matomezu/box:shape-box", props: {} }
const list = { id: "n2", x: 200, y: 10, item: "@matomezu/list:shape-list", props: {} }

describe("組み立てたブックの形", () => {
  test("ページに置けるのは、タイプが選んだアイテムだけ", () => {
    const boxesOnly = buildCoreCatalog(
      withDrawing({ items: { allowed: ["@matomezu/box:shape-box"], defaults: ["@matomezu/box:shape-box"] } }),
    )
    expect(restoreBooks(CORE_CATALOG, [book([page([box, list])])])).toHaveLength(1)
    expect(restoreBooks(boxesOnly, [book([page([box, list])])])).toHaveLength(0)
    expect(restoreBooks(boxesOnly, [book([page([box])])])).toHaveLength(1)
  })

  test("設定の項目のフィールドを持てるのは、タイプがその項目を選んだときだけ", () => {
    const noRoute = buildCoreCatalog(withDrawing({ settings: { book: [], page: ["@matomezu/line:line-route"] } }))
    expect(
      restoreBooks(CORE_CATALOG, [book([page([])], { settings: { "@matomezu/line:line-route": "straight" } })]),
    ).toHaveLength(1)
    expect(
      restoreBooks(noRoute, [book([page([])], { settings: { "@matomezu/line:line-route": "straight" } })]),
    ).toHaveLength(0)
    expect(
      restoreBooks(noRoute, [book([page([], { settings: { "@matomezu/line:line-route": "straight" } })])]),
    ).toHaveLength(1)
  })

  test("保存したデータのフィールドの並び: タイプの頭のフィールド（type・id・title）・ページ・設定の項目・タイプのほかのフィールド", () => {
    const [restored] = restoreBooks(CORE_CATALOG, [
      { ...book([page([])]), settings: { "@matomezu/line:line-route": "straight" } },
    ])
    expect(Object.keys(restored!)).toEqual(["type", "id", "title", "pages", "settings"])
    expect(Object.keys((restored as BookOf<"@matomezu/drawing:drawing">).pages[0]!)).toEqual([
      "id",
      "title",
      "paper",
      "orientation",
      "items",
    ])
  })

  test("設定の値は、ページ → ブック → 定義の既定 の順に、最初に値のある所で決まる", () => {
    const b = book([page([], { settings: { "@matomezu/line:line-route": "straight" } }), { ...page([]), id: "p2" }], {
      settings: { "@matomezu/line:line-route": "elbow" },
    })
    const [p1, p2] = (b as { pages: object[] }).pages
    const read = (target: object, at: object | null) =>
      settingValue(CORE_CATALOG, target as never, at, "@matomezu/line:line-route")
    expect(read(b, p1!)).toBe("straight")
    expect(read(b, p2!)).toBe("elbow")
    expect(read(book([page([])]), null)).toBe("elbow") // 定義の既定
    expect(read({ ...b, settings: { "@matomezu/line:line-route": "straight" } }, p2!)).toBe("straight")
  })
})

describe("組み立ての食い違い", () => {
  test("タイプが自分のフィールドに、機能台帳が足すフィールド（pages・settings）を書くと error", () => {
    const own = drawing.schema.extend({ pages: z.array(z.unknown()) })
    expect(checkCoreCatalog(withDrawing({ schema: own })).map(p => p.code)).toContain("E025")
    const route = drawing.schema.extend({ settings: z.object({}).optional() })
    expect(checkCoreCatalog(withDrawing({ schema: route })).map(p => p.code)).toContain("E025")
  })

  test("表に無い設定の項目・見せ方を選ぶと error", () => {
    expect(checkCoreCatalog(withDrawing({ settings: { book: ["nope.setting"] } })).map(p => p.code)).toContain("E008")
    expect(checkCoreCatalog(withDrawing({ presentation: "nope" })).map(p => p.code)).toContain("E008")
  })

  test("形のアイテムが名指すダイアログがインスタンスに無ければ、組み立てで error", () => {
    const box = BUILTIN.find(p => p.id === "@matomezu/box")!
    const broken = { ...box, dialogs: [] }
    const plugins = BUILTIN.map(p => (p === box ? broken : p))
    let code: string | undefined
    try {
      assemble(plugins)
    } catch (e) {
      code = (e as { details?: { code: string }[] }).details?.[0]?.code
    }
    expect(code).toBe("E026")
  })
})

// プラグインのアイテムを差し替えて組み立てたときの問題（base とフローチャートの組み立てのときの確かめ）
const problemsWith = (plugin: string, item: string, patch: object) => {
  const plugins = (BUILTIN as readonly Plugin[]).map(p =>
    p.id === plugin ? { ...p, items: (p.items ?? []).map(i => (i.id === item ? { ...i, ...patch } : i)) } : p,
  )
  try {
    assemble(plugins)
    return []
  } catch (e) {
    return (e as { details?: { code: string; params: Record<string, unknown> }[] }).details ?? []
  }
}

test("形の themeProp・captionProp が props に無い項目を名指したら E028（base の組み立てのときの確かめ）", () => {
  expect(problemsWith("@matomezu/box", "@matomezu/box:shape-box", { themeProp: "look" }).map(p => p.code)).toEqual([
    "E028",
  ])
  expect(
    problemsWith("@matomezu/list", "@matomezu/list:shape-list", { captionProp: "name" }).map(p => p.params.field),
  ).toEqual(["captionProp"])
  expect(() => assemble(BUILTIN)).not.toThrow()
})

test("形の仲間の名前が文言の表に無ければ E018（base の組み立てのときの確かめ）", () => {
  const found = problemsWith("@matomezu/shape", "@matomezu/shape:shape-diamond", {
    familyTitle: "no such message",
  })
  expect(found.map(p => p.code)).toEqual(["E018"])
})

test("追加プラグインは組み立てのときの確かめを持てない（E308）", () => {
  expect(() => assemble([...BUILTIN, { id: "extra", checks: [() => []] }])).toThrow(/E308|only built-in/)
})
