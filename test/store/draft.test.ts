import { expect, test } from "bun:test"
import { findShape, type ItemPage, type PlacedShape, replaceShape } from "../../web/src/core/placed"
import { settledDraft } from "../../web/src/plugins/paper/placing/draft"
import { CORE_CATALOG } from "../support"

// ダイアログの下書きを重ねたページの整え（paper の settledDraft）: 下書きで変わった形は、どの深さの子でも形の整えに通す

const row = (id: string, checked: boolean) => ({ id, item: "list.row", props: { caption: id, checked } })
const list = {
  id: "l1",
  item: "@matomezu/list:shape-list",
  x: 8,
  y: 40,
  w: 200,
  h: 120,
  props: { caption: "リスト", checklist: true },
  children: [row("r1", true), row("r2", false)],
}
const page = {
  id: "p1",
  title: "P",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
  items: [
    {
      id: "b1",
      item: "@matomezu/box:shape-nest-box",
      x: 40,
      y: 40,
      w: 300,
      h: 240,
      props: { caption: "箱" },
      shapes: [list],
    },
  ],
} as unknown as ItemPage

test("箱の中のリストのチェックリストを外す下書きは、そのリストの整えに通り、行のチェックが消える", () => {
  const draft = replaceShape(page, "l1", s => ({ ...s, props: { ...s.props, checklist: false } }) as PlacedShape)!
  const settled = settledDraft(CORE_CATALOG, page, draft)
  const rows = (findShape(settled, "l1")!.shape as unknown as typeof list).children
  expect(rows.map(r => "checked" in r.props)).toEqual([false, false])
})

test("下書きで何も変わらなければ、ページをそのまま返す", () => {
  expect(settledDraft(CORE_CATALOG, page, page)).toBe(page)
})
