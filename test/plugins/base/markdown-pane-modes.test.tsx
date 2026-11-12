// マークダウンのペインの並べ方（base の MARKDOWN_PANE_MODES・MARKDOWN_PANE_MODE_ICONS）: 並べ方ごとにアイコンがあり、マークダウンのブックのコマンドのアイコンは、同じ並べ方のアイコンを当てる
import { expect, test } from "bun:test"
import { MARKDOWN_PANE_MODES } from "../../../web/src/plugins/base"
import { MARKDOWN_PANE_MODE_ICONS } from "../../../web/src/plugins/base/ui"
import { PANE_LAYOUT_COMMANDS } from "../../../web/src/plugins/books/markdown/commands"
import { PANE_MODES } from "../../../web/src/plugins/books/markdown/panes"
import { PANE_LAYOUT_ICONS } from "../../../web/src/plugins/books/markdown/view/pane-icons"

test("並べ方ごとにアイコンがある", () => {
  expect(Object.keys(MARKDOWN_PANE_MODE_ICONS).sort()).toEqual([...MARKDOWN_PANE_MODES].sort())
})

test("マークダウンのブックの並べ方は base の値と同じで、4 つのコマンドのアイコンは同じ並べ方のアイコン", () => {
  expect(PANE_MODES).toBe(MARKDOWN_PANE_MODES)
  expect(Object.keys(PANE_LAYOUT_ICONS).sort()).toEqual(PANE_LAYOUT_COMMANDS.map(c => c.id).sort())
  expect(new Set(Object.values(PANE_LAYOUT_ICONS))).toEqual(new Set(Object.values(MARKDOWN_PANE_MODE_ICONS)))
})
