import { expect, test } from "bun:test"
import { z } from "zod"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin } from "../../web/src/store/plugin"

const MESSAGES = { Star: { en: "Star", ja: "星" }, Board: { en: "Board", ja: "ボード" } }
const kit = pluginKit("@foo/stars", MESSAGES)

const thrown = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return e
  }
  return null
}

test("短い名前に、プラグインの id と : の頭を付けて返す（id・名前・欄の宣言・文言の鍵）", () => {
  const dialog = kit.defineDialog({ id: "star-edit" })
  expect(dialog.id).toBe("@foo/stars:star-edit")
  const paper = kit.definePaper({ id: "square", title: "Star", size: { w: 100, h: 100 } })
  expect(paper as unknown).toEqual({ id: "@foo/stars:square", title: "@foo/stars:Star", size: { w: 100, h: 100 } })
  expect(kit.name("star-fill")).toBe("@foo/stars:star-fill")
  expect(kit.message("Board")).toBe("@foo/stars:Board")
  expect(Object.keys(kit.messages)).toEqual(["@foo/stars:Star", "@foo/stars:Board"])
})

test("テーマが上書きする欄の鍵は、: が無ければ自分の欄", () => {
  const theme = kit.defineTheme({
    id: "night",
    title: "Star",
    base: {} as never,
    palette: {} as never,
    tokens: { "star-fill": "#ffd34d", "@matomezu/box:box-fill": "#000000" },
  })
  expect(theme.tokens as unknown).toEqual({ "@foo/stars:star-fill": "#ffd34d", "@matomezu/box:box-fill": "#000000" })
})

test("ブックのタイプは schema に type を書かず、データの type（1 冊だけならブックの id も）は本当の id", () => {
  const many = kit.defineBookType({
    id: "board",
    version: 1,
    title: "Board",
    schema: z.strictObject({ id: z.string() }),
    single: false,
    create: init => ({ ...init }),
    pages: null,
    items: { allowed: [], defaults: [] },
    actions: {},
    theme: "@matomezu/base:standard",
    presentation: "@matomezu/paper:paper",
    tokens: [],
  })
  expect(many.create({ id: "b1", title: "T" }) as unknown).toEqual({ type: "@foo/stars:board", id: "b1", title: "T" })
  expect(many.schema.parse({ type: "@foo/stars:board", id: "b1" }).type).toBe("@foo/stars:board")
  const single = kit.defineBookType({
    id: "home",
    version: 1,
    title: "Board",
    schema: z.strictObject({ id: z.string() }),
    single: true,
    book: {},
    pages: null,
    items: { allowed: [], defaults: [] },
    actions: {},
    theme: "@matomezu/base:standard",
    presentation: "@matomezu/paper:paper",
    tokens: [],
  })
  expect(single.book as unknown).toEqual({ type: "@foo/stars:home", id: "@foo/stars:home", title: "" })
})

test("名前に使えるのは英小文字・数字・- だけ（先頭は英小文字）", () => {
  expect(thrown(() => kit.defineDialog({ id: "starEdit" }))).toMatchObject({ code: "E305" })
  expect(thrown(() => kit.defineDialog({ id: "star.edit" }))).toMatchObject({ code: "E305" })
  expect(thrown(() => kit.defineDialog({ id: "1star" }))).toMatchObject({ code: "E305" })
})

test("組み立ては、名前の字と、欄の名前が土台の CSS 変数の頭（theme-・skin-）で始まらないかを確かめる", () => {
  const badName = definePlugin({ id: "notes", dialogs: [{ id: "notes:Shot" }] })
  expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, badName], partial: true }))).toMatchObject({
    code: "E301",
  })
  const notes = pluginKit("notes", MESSAGES)
  const shape = notes.defineShape({
    id: "dot",
    kind: "shape",
    version: 1,
    title: "Star",
    capabilities: [],
    toolbox: false,
    props: z.strictObject({}),
    size: { w: 10, h: 10 },
    sizeOf: () => ({ w: 10, h: 10 }),
    captionWidth: () => 10,
    tokens: [{ id: "theme-fill", fallback: "fill" }],
  })
  const plugin = definePlugin(notes.plugin({ items: [shape] }))
  expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, plugin], partial: true }))).toMatchObject({
    code: "E306",
  })
})
