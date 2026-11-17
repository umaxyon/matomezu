// ツリーが中身を右・下へずらした印刷区画の数: 書く画面がステージに知らせる量（print.ts の laidOrigin）と、ブックタイプの contentOrigin が返す量（ページの slide の形をずらす）は同じ
import { expect, test } from "bun:test"
import { GROW } from "../../../../web/src/plugins/page-types/tree/grow"
import { laidOrigin, laidPage } from "../../../../web/src/plugins/page-types/tree/print"
import { TREE } from "../../../../web/src/plugins/page-types/tree/tree"
import { CORE_CATALOG } from "../../../support"

const page = {
  id: "p",
  title: "p",
  paper: "@matomezu/base:a4",
  orientation: "landscape",
  grows: true,
  root: { id: "r", caption: "根", children: [{ id: "a", caption: "子" }] },
} as never

const ALL = { up: true, down: true, left: true, right: true }
const RIGHT_DOWN = { up: false, down: true, left: false, right: true }

for (const [name, grow] of [
  ["四方へ増やす", ALL],
  ["右と下へ増やす", RIGHT_DOWN],
  ["可変ページでない", undefined],
] as const) {
  test(`${name}: 書く画面が知らせる量と contentOrigin が一致する`, () => {
    const setting = ((def: { id: string; fallback?: unknown }) => (def.id === GROW.id ? "center" : undefined)) as never
    const shown = laidOrigin(laidPage(CORE_CATALOG, page, { setting, grow }))
    expect(TREE.contentOrigin?.(CORE_CATALOG, page, setting, grow)).toEqual(shown)
    if (grow === ALL) expect(shown).toEqual({ x: 1, y: 1 })
  })
}
