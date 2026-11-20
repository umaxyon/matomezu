// 機能台帳が組み立てるブックの形: タイプが選んだアイテム・設定の項目・プレゼンテーションから作り、選んでいないものは受け付けない
import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { checkBooks, restoreBooks } from "../../web/src/core/book"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { checkCoreCatalog } from "../../web/src/core/core-catalog-check"
import { BUILTIN } from "../../web/src/plugins"
import { settingValue } from "../../web/src/plugins/base/book-settings"
import { LINE_ROUTE } from "../../web/src/plugins/items/line/line"
import { assemble, type Plugin, warningsOf } from "../../web/src/store/plugin"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

const withDrawing = (patch: object) => ({
  ...BUILTIN_PARTS,
  pageTypes: BUILTIN_PARTS.pageTypes.map(t => (t.id === "@matomezu/drawing:drawing" ? { ...t, ...patch } : t)),
})
const page = (items: unknown[], extra: object = {}) => ({
  kind: "page",
  id: "p1",
  type: "@matomezu/drawing:drawing",
  title: "P",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
  items,
  ...extra,
})
const book = (lineup: unknown[], extra: object = {}) => ({
  id: "b1",
  title: "T",
  lineup,
  ...extra,
})
// 台帳 catalog で読んだブック saved の、最初のページ: 読めれば "page"、読めないページを持てばその理由の番号、ほかの訳でブックごと読めなければ "no-book"
const firstPage = (catalog: Parameters<typeof checkBooks>[0], saved: unknown) => {
  const read = checkBooks(catalog, [saved])
  const code = read.warnings[0]?.code
  return read.books[0]?.lineup[0]?.kind ?? (code === "W027" || code === "W028" || code === "W029" ? code : "no-book")
}
const box = { id: "n1", x: 10, y: 10, item: "@matomezu/box:shape-nest-box", props: {} }
const list = { id: "n2", x: 200, y: 10, item: "@matomezu/list:shape-list", props: {} }

describe("組み立てたブックの形", () => {
  test("ページに置けるのは、タイプが選んだアイテムだけ（ほかを置いたページは、形に合わない読めないページ W028）", () => {
    const boxesOnly = buildCoreCatalog(withDrawing({ items: { allowed: ["@matomezu/box:shape-nest-box"] } }))
    expect(firstPage(CORE_CATALOG, book([page([box, list])]))).toBe("page")
    expect(firstPage(boxesOnly, book([page([box, list])]))).toBe("W028")
    expect(firstPage(boxesOnly, book([page([box])]))).toBe("page")
  })

  test("設定の項目のフィールドを持てるのは、タイプがその項目を選んだときだけ（ページで破れば読めないページ W028、ブックで破ればブックごと読めない）", () => {
    const noRoute = buildCoreCatalog(withDrawing({ settings: [] }))
    const routed = book([page([], { settings: { "@matomezu/line:line-route": "straight" } })])
    expect(firstPage(CORE_CATALOG, routed)).toBe("page")
    expect(firstPage(noRoute, routed)).toBe("W028")
    // ページの項目はブックに持てない（ブックが持てるのは、ブックの項目だけ）
    expect(
      restoreBooks(CORE_CATALOG, [book([page([])], { settings: { "@matomezu/line:line-route": "straight" } })]),
    ).toHaveLength(0)
  })

  test("保存したデータのフィールドの並び: ブックは id・title・lineup・settings、ページは kind・id・type・title・紙・アイテム・設定の項目", () => {
    const [restored] = restoreBooks(CORE_CATALOG, [
      {
        ...book([page([], { settings: { "@matomezu/line:line-route": "straight" } })]),
        settings: { "@matomezu/base:print-preview-flow": "row" },
      },
    ])
    expect(Object.keys(restored!)).toEqual(["id", "title", "lineup", "settings"])
    expect(Object.keys(restored!.lineup[0]!)).toEqual([
      "kind",
      "id",
      "type",
      "title",
      "paper",
      "orientation",
      "items",
      "settings",
    ])
  })

  test("ページの設定の値は、ページ → 定義の既定 の順に、最初に値のある所で決まる（ブックの値には戻らない）", () => {
    expect(
      settingValue(CORE_CATALOG, page([], { settings: { "@matomezu/line:line-route": "straight" } }), LINE_ROUTE),
    ).toBe("straight")
    expect(settingValue(CORE_CATALOG, page([]), LINE_ROUTE)).toBe("elbow") // 定義の既定
    expect(settingValue(CORE_CATALOG, null, LINE_ROUTE)).toBe("elbow")
  })
})

describe("台帳アセンブルの食い違い", () => {
  test("タイプがページに足すフィールドに、エントリが使う名前（lineup）や土台のフィールドの名前を書くと error", () => {
    expect(checkCoreCatalog(withDrawing({ fields: { lineup: z.array(z.unknown()) } })).map(p => p.code)).toContain(
      "E030",
    )
    expect(checkCoreCatalog(withDrawing({ fields: { settings: z.object({}) } })).map(p => p.code)).toContain("E030")
  })

  test("表に無い設定の項目・プレゼンテーションを選ぶと error", () => {
    expect(checkCoreCatalog(withDrawing({ settings: ["nope.setting"] })).map(p => p.code)).toContain("E008")
    expect(checkCoreCatalog(withDrawing({ presentation: "nope" })).map(p => p.code)).toContain("E008")
  })

  test("形のアイテムが名指すダイアログがインスタンスに無ければ、台帳アセンブルで error", () => {
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

// プラグインのアイテムを差し替えて台帳アセンブルしたときの問題（base とフローチャートの台帳アセンブルのときの確かめ）
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

test("形の themeProp・captionProp が props に無い項目を名指したら E028（base の台帳アセンブルのときの確かめ）", () => {
  expect(problemsWith("@matomezu/box", "@matomezu/box:shape-nest-box", { themeProp: "look" }).map(p => p.code)).toEqual(
    ["E028"],
  )
  expect(
    problemsWith("@matomezu/list", "@matomezu/list:shape-list", { captionProp: "name" }).map(p => p.params.field),
  ).toEqual(["captionProp"])
  expect(() => assemble(BUILTIN)).not.toThrow()
})

test("scrapFrame を、項目の形がスクラップの形でない形に書いたら E127（base の台帳アセンブルのときの確かめ）", () => {
  expect(
    problemsWith("@matomezu/box", "@matomezu/box:shape-nest-box", { scrapFrame: true }).map(p => [p.code, p.params.id]),
  ).toEqual([["E127", "@matomezu/box:shape-nest-box"]])
})

test("形の仲間の名前が文言の表に無ければ E018（base の台帳アセンブルのときの確かめ）", () => {
  const found = problemsWith("@matomezu/shape", "@matomezu/shape:shape-diamond", {
    familyTitle: "no such message",
  })
  expect(found.map(p => p.code)).toEqual(["E018"])
})

test("テーマの textColors の色が #rrggbb でなければ E038（base の台帳アセンブルのときの確かめ）", () => {
  const plugins = (BUILTIN as readonly Plugin[]).map(p =>
    p.id === "@matomezu/base"
      ? {
          ...p,
          themes: (p.themes ?? []).map(t =>
            t.id === "@matomezu/base:matomezu"
              ? { ...t, textColors: { ...t.textColors, "@matomezu/base:warn": "orange" } }
              : t,
          ),
        }
      : p,
  )
  let found: { code: string }[] = []
  try {
    assemble(plugins)
  } catch (e) {
    found = (e as { details?: { code: string }[] }).details ?? []
  }
  expect(found.map(p => p.code)).toEqual(["E038"])
})

test("テーマの textColors が機能台帳に無い文字の色を名指したら W014 を残し、台帳アセンブルは止めない（base の台帳アセンブルのときの確かめ）", () => {
  const plugins = (BUILTIN as readonly Plugin[]).map(p =>
    p.id === "@matomezu/base"
      ? {
          ...p,
          themes: (p.themes ?? []).map(t =>
            t.id === "@matomezu/base:matomezu" ? { ...t, textColors: { ...t.textColors, "@ex/gone:x": "#123456" } } : t,
          ),
        }
      : p,
  )
  const warnings = assemble(plugins).catalog.store.warnings
  expect(warnings.map(w => [w.code, w.plugin, w.params.textColor])).toEqual([["W014", "@matomezu/base", "@ex/gone:x"]])
})

test("テーマがデータの動き方のテーマキーに決まった言葉でない値を、棒の丸みに px でない値を書いたら W015 を残し、台帳アセンブルは止めない", () => {
  const plugins = (BUILTIN as readonly Plugin[]).map(p =>
    p.id === "@matomezu/base"
      ? {
          ...p,
          themes: (p.themes ?? []).map(t =>
            t.id === "@matomezu/base:simple"
              ? {
                  ...t,
                  tokens: {
                    ...t.tokens,
                    "@matomezu/data:data-motion-bar": "fade",
                    "@matomezu/data:data-motion-pie": { light: "sweep", dark: "spin" },
                    "@matomezu/data:data-bar-radius": "large",
                  },
                }
              : t,
          ),
        }
      : p,
  )
  const warnings = assemble(plugins).catalog.store.warnings.filter(w => w.code === "W015")
  expect(warnings.map(w => [w.plugin, w.params.token, w.params.value])).toEqual([
    ["@matomezu/base", "@matomezu/data:data-motion-pie", "spin"],
    ["@matomezu/base", "@matomezu/data:data-bar-radius", "large"],
  ])
})

test("テーマが明暗で同じ値だけのテーマキー（shades: one）に明暗で違う値を書いたら W020 を残し（追加プラグインのテーマキーも）、色のテーマキーと同じ値の明暗は見ない", () => {
  const simple = (BUILTIN as readonly Plugin[]).flatMap(p => p.themes ?? []).find(t => t.id === "@matomezu/base:simple")
  if (simple === undefined) throw new Error("no simple theme")
  const stars: Plugin = {
    id: "@foo/stars",
    tokens: [
      { id: "@foo/stars:star-size", value: "4px", shades: "one" },
      { id: "@foo/stars:star-fill", value: "#ffcc00" },
    ],
    themes: [
      {
        ...simple,
        id: "@foo/stars:night",
        tokens: {
          "@foo/stars:star-size": { light: "4px", dark: "6px" },
          "@foo/stars:star-fill": { light: "#ffcc00", dark: "#886600" },
        },
      },
    ],
  }
  const plugins = [...(BUILTIN as readonly Plugin[]), stars].map(p =>
    p.id === "@matomezu/base"
      ? {
          ...p,
          themes: (p.themes ?? []).map(t =>
            t.id === "@matomezu/base:simple"
              ? {
                  ...t,
                  tokens: {
                    ...t.tokens,
                    "@matomezu/markdown:markdown-font-size": { light: "14px", dark: "16px" },
                    "@matomezu/markdown:markdown-h1-size": { light: "2em", dark: "2em" },
                    "@matomezu/markdown:markdown-link": { light: "#0969da", dark: "#4493f8" },
                    "@matomezu/box:box-radius": { light: "8px", dark: "0px" },
                  },
                }
              : t,
          ),
        }
      : p,
  )
  const warnings = warningsOf(assemble(plugins).catalog).filter(w => w.code === "W020")
  expect(warnings.map(w => [w.plugin, w.params.token, w.params.light, w.params.dark]).sort()).toEqual([
    ["@foo/stars", "@foo/stars:star-size", "4px", "6px"],
    ["@matomezu/base", "@matomezu/box:box-radius", "8px", "0px"],
    ["@matomezu/base", "@matomezu/markdown:markdown-font-size", "14px", "16px"],
  ])
})

test("追加プラグインはコントロールセンターを持てない（E311）", () => {
  expect(() => assemble([...BUILTIN, { id: "extra", controlCenters: [{ id: "extra:center", actions: [] }] }])).toThrow(
    /E311|only built-in/,
  )
})

test("追加プラグインはノーマライズステップを持てない（E310）", () => {
  const step = { pageFields: [], normalize: (_before: unknown, after: never) => after }
  expect(() => assemble([...BUILTIN, { id: "extra", normalizeSteps: [step] }])).toThrow(/E310|only built-in/)
})

test("追加プラグインは台帳アセンブルのときの確かめを持てない（E308）", () => {
  expect(() => assemble([...BUILTIN, { id: "extra", checks: [() => []] }])).toThrow(/E308|only built-in/)
})
