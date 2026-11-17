// マークダウンのブックの並べ方は base の値と同じで、4 つのコマンドのアイコンは同じ並べ方の base のアイコン
import { expect, test } from "bun:test"
import { MARKDOWN_PANE_MODES } from "../../../../web/src/plugins/base"
import { MARKDOWN_PANE_MODE_ICONS } from "../../../../web/src/plugins/base/ui"
import { PANE_LAYOUT_COMMANDS } from "../../../../web/src/plugins/page-types/markdown/commands"
import { PANE_MODES } from "../../../../web/src/plugins/page-types/markdown/panes"
import { PANE_LAYOUT_ICONS } from "../../../../web/src/plugins/page-types/markdown/view/pane-icons"

test("マークダウンのブックの並べ方は base の値と同じで、4 つのコマンドのアイコンは同じ並べ方のアイコン", () => {
  expect(PANE_MODES).toBe(MARKDOWN_PANE_MODES)
  expect(Object.keys(PANE_LAYOUT_ICONS).sort()).toEqual(PANE_LAYOUT_COMMANDS.map(c => c.id).sort())
  expect(new Set(Object.values(PANE_LAYOUT_ICONS))).toEqual(new Set(Object.values(MARKDOWN_PANE_MODE_ICONS)))
})
