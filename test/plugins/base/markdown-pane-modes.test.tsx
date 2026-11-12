// マークダウンのペインの並べ方（base の MARKDOWN_PANE_MODES・MARKDOWN_PANE_MODE_ICONS）: 並べ方ごとにアイコンがある
import { expect, test } from "bun:test"
import { MARKDOWN_PANE_MODES } from "../../../web/src/plugins/base"
import { MARKDOWN_PANE_MODE_ICONS } from "../../../web/src/plugins/base/ui"

test("並べ方ごとにアイコンがある", () => {
  expect(Object.keys(MARKDOWN_PANE_MODE_ICONS).sort()).toEqual([...MARKDOWN_PANE_MODES].sort())
})
