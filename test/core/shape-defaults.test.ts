import { expect, test } from "bun:test"
import { z } from "zod"
import type { PlacedShape } from "../../web/src/core/placed"
import { BUILTIN } from "../../web/src/plugins"
import { placedSize } from "../../web/src/plugins/base"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin } from "../../web/src/store/plugin"

// 紙に置くための値（sizeOf・captionWidth・min）を書かない形
const dots = pluginKit("dots", { Dot: { en: "Dot" } })
const DOT = dots.defineShape({
  id: "dot",
  kind: "shape",
  version: 1,
  title: "Dot",
  capabilities: ["resizable"],
  toolbox: true,
  props: z.strictObject({}),
  size: { w: 40, h: 30 },
  tokens: [],
})
const PLUGIN = definePlugin(dots.plugin({ items: [DOT] }))

test("sizeOf を書かない形の大きさは、置いたときの w・h、無ければ定義の size", () => {
  const catalog = createMatomezu({ plugins: [...BUILTIN, PLUGIN], partial: true }).catalog.core
  // core/catalog.ts に書き足していない追加プラグインのアイテムなので、置いた形の型は言い張る
  const placed = (more: object) => ({ id: "a", x: 0, y: 0, item: DOT.id, props: {}, ...more }) as unknown as PlacedShape
  expect(placedSize(catalog, placed({}))).toEqual({ w: 40, h: 30 })
  expect(placedSize(catalog, placed({ w: 80 }))).toEqual({ w: 80, h: 30 })
  expect(placedSize(catalog, placed({ w: 80, h: 60 }))).toEqual({ w: 80, h: 60 })
})
