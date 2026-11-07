// 紙の見せ方の、物が見えているかの答え（seenOnPaper）: 形は頭（上から 24）が表示領域に入れば見えている（子の形も）。つなぐものは、どちらかの端の形が見えていれば
import { expect, test } from "bun:test"
import type { ItemPage } from "../../web/src/core/placed"
import { seenOnPaper } from "../../web/src/plugins/paper/seen"
import { CORE_CATALOG } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const box = (id: string, x: number, y: number) => ({ id, item: BOX, x, y, w: 100, h: 100, props: { caption: id } })
const page = {
  id: "p",
  title: "p",
  paper: "@matomezu/base:a4",
  orientation: "portrait",
  items: [
    box("a", 0, 0),
    box("b", 0, 500),
    { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} },
  ],
} as unknown as ItemPage

test("形は頭が表示領域に入れば見えている。頭より下だけが入っていても見えていない", () => {
  expect(seenOnPaper(CORE_CATALOG, page, "a", { x: 0, y: 0, w: 300, h: 50 })).toBe(true)
  expect(seenOnPaper(CORE_CATALOG, page, "a", { x: 0, y: 40, w: 300, h: 50 })).toBe(false)
  expect(seenOnPaper(CORE_CATALOG, page, "b", { x: 0, y: 0, w: 300, h: 300 })).toBe(false)
})

test("つなぐものは、どちらかの端の形が見えていれば見えている。ページに無い物は見えていない", () => {
  expect(seenOnPaper(CORE_CATALOG, page, "l", { x: 0, y: 480, w: 300, h: 100 })).toBe(true)
  expect(seenOnPaper(CORE_CATALOG, page, "l", { x: 500, y: 0, w: 100, h: 100 })).toBe(false)
  expect(seenOnPaper(CORE_CATALOG, page, "none", { x: 0, y: 0, w: 3000, h: 3000 })).toBe(false)
})
