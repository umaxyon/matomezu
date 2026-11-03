// つなぐもの（線など）を種類ごとに分ける byConnector（core/placed.ts）と、それを使う base の外枠 extentOf（place/items.ts）
import { expect, test } from "bun:test"
import type { ConnectorData } from "../../web/src/core/def/item"
import { byConnector, type ItemPage } from "../../web/src/core/placed"
import { extentOf } from "../../web/src/plugins/base/place/items"
import { portAreasOf, rectsOf } from "../../web/src/plugins/base/place/placed"
import { CORE_CATALOG } from "../support"

const LINE = "@matomezu/line:connector-line"
const BOX = "@matomezu/box:shape-nest-box"
const setting = () => undefined

const page = (items: unknown[]): ItemPage =>
  ({ id: "p1", title: "", paper: "@matomezu/base:a4", orientation: "landscape", items }) as ItemPage
const box = (id: string, x: number) => ({ id, item: BOX, x, y: 100, w: 100, h: 60, props: {} })
const line = (id: string, from: string, to: string, props: Record<string, unknown> = {}) => ({
  id,
  item: LINE,
  from,
  to,
  props: { route: "straight", ...props },
})

test("byConnector は、つなぐものを定義ごとに置いた順で分け、機能台帳に無いつなぐものは入れない", () => {
  const groups = byConnector(
    CORE_CATALOG,
    page([
      box("a", 100),
      line("l1", "a", "b"),
      { id: "g", item: "@other:gone", from: "a", to: "b", props: {} },
      box("b", 400),
      line("l2", "b", "a"),
    ]),
  )
  expect(groups.map(([def, list]) => [def.id, list.map(c => c.id)])).toEqual([[LINE, ["l1", "l2"]]])
})

test("extentOf は、形の四角に、つなぐものの定義の bounds（線のキャプションなど）を重ねた外枠", () => {
  const p = page([
    box("a", 100),
    box("b", 400),
    line("l", "a", "b", { caption: "とても長い線のキャプション", captionOffset: 40 }),
  ])
  const lines = byConnector(CORE_CATALOG, p)[0]![1] as ConnectorData[]
  const def = CORE_CATALOG.items.get(LINE)
  const bounds = def?.kind === "connector" ? def.bounds?.(lines, portAreasOf(CORE_CATALOG, p), setting) : null
  if (!bounds) throw new Error("線の bounds が無い")
  const extent = extentOf(CORE_CATALOG, p, setting)!
  // 線のキャプションは、形の四角の外まで出る
  expect(bounds.y + bounds.h).toBeGreaterThan(160)
  const boxes = [...rectsOf(CORE_CATALOG, p).values(), bounds]
  const x = Math.min(...boxes.map(b => b.x))
  const y = Math.min(...boxes.map(b => b.y))
  expect(extent).toEqual({
    x,
    y,
    w: Math.max(...boxes.map(b => b.x + b.w)) - x,
    h: Math.max(...boxes.map(b => b.y + b.h)) - y,
  })
})
