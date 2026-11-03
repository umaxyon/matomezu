// ブックで使えるアイテム: 置ける・引けるのはタイプの候補（items.allowed）、ツールボックスに出すのはそのうちの既定（items.defaults）
import { expect, test } from "bun:test"
import { z } from "zod"
import { bookItems } from "../../web/src/core/book"
import { defineBookType } from "../../web/src/core/def/book-type"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { panelOf, toolboxOf } from "../../web/src/plugins/base/toolbox/toolbox"
import { DRAWING } from "../../web/src/plugins/books/drawing/drawing"
import { usesLines } from "../../web/src/plugins/items/line/line"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { sequence } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const CAT = "@matomezu/art:shape-cat"
const LINE = "@matomezu/line:connector-line"

// 図面のアイテムを全部置けるが、ツールボックスには内包ボックス・シェイプの猫・線を出さないタイプの見本（図面のブックのタイプを借りる）
const PICKY = defineBookType({
  ...DRAWING,
  id: "notes:picky",
  schema: z.strictObject({ type: z.literal("notes:picky"), id: z.string().min(1) }),
  create: init => ({ type: "notes:picky" as const, ...init, pages: [] }),
  items: {
    allowed: DRAWING.items.allowed,
    defaults: DRAWING.items.defaults.filter(id => id !== BOX && id !== CAT && id !== LINE),
  },
})

test("候補にあって既定に無いアイテムは、置けて線も使えるが、ツールボックスとシェイプパネルには出ない", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN, definePlugin({ id: "notes", bookTypes: [PICKY] })],
    partial: true,
    home: "@matomezu/master:master",
    newId: sequence(),
  })
  const catalog = instance.catalog.core
  const perform = instance.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean }
  expect(createBookIn(instance, "s1", { title: "見本", type: "notes:picky" as never })).toBe(true)
  const id = Object.keys(instance.state.getState().books).find(b => b !== "@matomezu/master:master") as string
  const book = { type: "notes:picky" } as never
  expect(bookItems(catalog, book)).toEqual(DRAWING.items.allowed)
  expect(usesLines(catalog, book)).toBe(true)
  const shown = instance.state.getState().books[id] as never
  expect(toolboxOf(catalog, shown)).not.toContain(BOX)
  expect(panelOf(catalog, shown)).not.toContain(CAT)
  expect(panelOf(catalog, shown).length).toBeGreaterThan(0)
  expect(perform("@matomezu/base:page-add", { title: "p", orientation: "landscape" }, { book: id }).ok).toBe(true)
  const page = (instance.state.getState().books[id] as unknown as { pages: { id: string }[] }).pages[0]?.id
  expect(perform("@matomezu/paper:item-place", { page, item: BOX, at: { x: 40, y: 40 } }, { book: id }).ok).toBe(true)
  expect(perform("@matomezu/paper:item-place", { page, item: CAT, at: { x: 300, y: 40 } }, { book: id }).ok).toBe(true)
})
