// ディレクトリ構成図のページの印刷: 行と説明を並べ（layout.ts。ビューと同じ並べ方と座標）、可変ページなら行と説明が入るだけ並べた印刷区画の数と、
// 行と説明が載る印刷区画を返す（見せ方の printSheets）。罫線は行から決まるので数えない
import type { CoreCatalog, ItemPage, Rect, Size } from "../../../plugin-api"
import {
  type GrowSides,
  grownArea,
  type PrintSheets,
  paperSize,
  type SettingReader,
  sheetKey,
  sheetsOfShape,
} from "../../base"
import { dirRootOf } from "./entry"
import { type DirLayout, laidBottom, laidRight, layoutDir } from "./layout"
import { NOTES } from "./notes"

// ページ page の行と説明を並べたもの（描けない紙と根の無いページは null）。setting はそのページで効いている設定の値、grow はページの増やす向き
export function laidPage(
  catalog: CoreCatalog,
  page: ItemPage,
  { setting, grow }: { setting: SettingReader; grow: GrowSides | undefined },
): DirLayout | null {
  const root = dirRootOf(page)
  const paper = paperSize(catalog, page)
  return root && paper ? layoutDir(root, paper, setting(NOTES), grow !== undefined) : null
}

// 可変ページで、並べた行と説明 laid が入るだけ印刷区画を並べた数と広さ（spare なら、増やす向きに空きの印刷区画を足す。書く画面がステージに知らせる広さ）
export const laidArea = (paper: Size, grow: GrowSides, laid: DirLayout, spare: boolean) =>
  grownArea(paper, grow, { x: 0, y: 0, w: laidRight(laid), h: laidBottom(laid.rows) }, spare)

export function dirPrintSheets(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | undefined },
): PrintSheets {
  const laid = laidPage(catalog, page, on)
  const paper = paperSize(catalog, page)
  if (!laid || !paper) return { columns: 1, rows: 1, filled: null }
  const notes = laid.notes
  const rects: Rect[] = [
    ...laid.rows,
    ...(notes ? laid.rows.filter(r => r.note).map(r => ({ x: notes.x, y: r.y, w: notes.w, h: r.h })) : []),
  ]
  const filled = new Set(rects.flatMap(r => sheetsOfShape(r, paper).map(c => sheetKey(c.column, c.row))))
  if (!on.grow) return { columns: 1, rows: 1, filled }
  const { columns, rows } = laidArea(paper, on.grow, laid, false)
  return { columns, rows, filled }
}
