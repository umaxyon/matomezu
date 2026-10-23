// 登録表が組み立てるブックの形: タイプが選んだアイテム・設定の項目・見せ方から作り、選んでいないものは受け付けない
import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { restoreBooks } from "../../web/src/core/book"
import { settingValue } from "../../web/src/core/book-settings"
import { defineSetting } from "../../web/src/core/def/setting"
import { buildRegistry, checkRegistry } from "../../web/src/core/registry"
import type { BookOf } from "../../web/src/core/schema/book"
import { BUILTIN } from "../../web/src/plugins"
import { assemble } from "../../web/src/store/plugin"
import { BUILTIN_PARTS, REGISTRY } from "../support"

const drawing = BUILTIN_PARTS.bookTypes.find(t => t.id === "drawing")!
const withDrawing = (patch: object) => ({
  ...BUILTIN_PARTS,
  bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t.id === "drawing" ? { ...t, ...patch } : t)),
})
const page = (items: unknown[], extra: object = {}) => ({
  id: "p1",
  title: "P",
  paper: "a4",
  orientation: "landscape",
  items,
  ...extra,
})
const book = (pages: unknown[], extra: object = {}) => ({ type: "drawing", id: "b1", title: "T", pages, ...extra })
const box = { id: "n1", x: 10, y: 10, item: "shape.box", props: {} }
const list = { id: "n2", x: 200, y: 10, item: "shape.list", props: {} }

describe("組み立てたブックの形", () => {
  test("ページに置けるのは、タイプが選んだアイテムだけ", () => {
    const boxesOnly = buildRegistry(withDrawing({ items: { allowed: ["shape.box"], defaults: ["shape.box"] } }))
    expect(restoreBooks(REGISTRY, [book([page([box, list])])])).toHaveLength(1)
    expect(restoreBooks(boxesOnly, [book([page([box, list])])])).toHaveLength(0)
    expect(restoreBooks(boxesOnly, [book([page([box])])])).toHaveLength(1)
  })

  test("設定の項目の欄を持てるのは、タイプがその項目を選んだときだけ", () => {
    const noRoute = buildRegistry(withDrawing({ settings: { book: [], page: ["line.route"] } }))
    expect(restoreBooks(REGISTRY, [book([page([])], { lineRoute: "straight" })])).toHaveLength(1)
    expect(restoreBooks(noRoute, [book([page([])], { lineRoute: "straight" })])).toHaveLength(0)
    expect(restoreBooks(noRoute, [book([page([], { lineRoute: "straight" })])])).toHaveLength(1)
  })

  test("保存したデータの欄の並び: タイプの頭の欄（type・id・title）・ページ・設定の項目・タイプのほかの欄", () => {
    const [restored] = restoreBooks(REGISTRY, [{ ...book([page([])]), theme: "sticky", lineRoute: "straight" }])
    expect(Object.keys(restored!)).toEqual(["type", "id", "title", "pages", "lineRoute", "theme"])
    expect(Object.keys((restored as BookOf<"drawing">).pages[0]!)).toEqual([
      "id",
      "title",
      "paper",
      "orientation",
      "items",
    ])
  })

  test("設定の値は、ページ → ブック → 定義の既定 の順に、最初に値のある所で決まる", () => {
    const b = book([page([], { lineRoute: "straight" }), { ...page([]), id: "p2" }], { lineRoute: "elbow" })
    const [p1, p2] = (b as { pages: object[] }).pages
    const read = (target: object, at: object | null) => settingValue(REGISTRY, target as never, at, "line.route")
    expect(read(b, p1!)).toBe("straight")
    expect(read(b, p2!)).toBe("elbow")
    expect(read(book([page([])]), null)).toBe("elbow") // 定義の既定
    expect(read({ ...b, lineRoute: "straight" }, p2!)).toBe("straight")
  })
})

describe("組み立ての食い違い", () => {
  test("タイプが自分の欄に、登録表が足す欄（pages・選んだ設定の項目の欄）を書くと誤り", () => {
    const own = drawing.schema.extend({ pages: z.array(z.unknown()) })
    expect(checkRegistry(withDrawing({ schema: own })).map(p => p.code)).toContain("E025")
    const route = drawing.schema.extend({ lineRoute: z.string().optional() })
    expect(checkRegistry(withDrawing({ schema: route })).map(p => p.code)).toContain("E025")
  })

  test("表に無い設定の項目・見せ方を選ぶと誤り。2 つの設定の項目が同じ欄を使うと誤り", () => {
    expect(checkRegistry(withDrawing({ settings: { book: ["nope.setting"] } })).map(p => p.code)).toContain("E008")
    expect(checkRegistry(withDrawing({ presentation: "nope" })).map(p => p.code)).toContain("E008")
    const twin = defineSetting({
      id: "twin.route",
      title: "Line route",
      field: "lineRoute",
      schema: z.string(),
      default: "",
    })
    const parts = { ...BUILTIN_PARTS, settings: [...BUILTIN_PARTS.settings, twin] }
    expect(checkRegistry(parts).map(p => p.code)).toContain("E027")
  })

  test("形のアイテムが名指すダイアログが app に無ければ、組み立てで誤り", () => {
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
