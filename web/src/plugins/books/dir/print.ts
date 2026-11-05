// ディレクトリ構成図のページの印刷: 行と説明を並べ（layout.ts。ビューと同じ並べ方と座標）、可変ページなら行と説明が入るだけ並べた印刷区画の数と、
// 行と説明が載る印刷区画を返す（見せ方の printSheets）。罫線は行から決まるので数えない。
// 印刷では、印刷区画の下の境目をまたぐ行と、それより下を次の印刷区画の頭まで送る（改ページ。printLaid。書く画面の並びは変えない）
import type { CoreCatalog, ItemPage, Point, Rect, Size } from "../../../plugin-api"
import {
  breakShift,
  type GrowSides,
  grownArea,
  type PrintSheets,
  paperSize,
  printSheetsOf,
  type SettingReader,
  type SheetPurpose,
} from "../../base"
import { dirRootOf } from "./entry"
import { type DirLayout, laidBottom, laidRight, layoutDir, MARGIN } from "./layout"
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
  grownArea(paper, grow, laidExtentOf(laid), spare)

// 並べた行と説明 laid の外枠（左上は紙の原点）
const laidExtentOf = (laid: DirLayout): Rect => ({ x: 0, y: 0, w: laidRight(laid), h: laidBottom(laid.rows) })

// 印刷のときの並べ方: 可変ページなら、境目をまたぐ行とそれより下の行・罫線・開け閉めの印を、次の印刷区画の頭（余白 MARGIN の下）まで送る
export function printLaid(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | undefined },
): DirLayout | null {
  const laid = laidPage(catalog, page, on)
  const paper = paperSize(catalog, page)
  if (!laid || !paper || !on.grow) return laid
  const dy = breakShift(
    laid.rows.map(r => ({ at: r.y, size: r.h })),
    paper.h,
    MARGIN,
  )
  const moved = (p: Point): Point => ({ x: p.x, y: p.y + dy(p.y) })
  const rows = laid.rows.map(r => ({ ...r, y: r.y + dy(r.y), toggle: r.toggle && moved(r.toggle) }))
  // 説明の列との区切り線は、送ったあとの一番下の行まで伸ばす
  const bottom = Math.max(...rows.map(r => r.y + r.h), laid.divider?.to.y ?? 0)
  return {
    ...laid,
    rows,
    lines: laid.lines.map(l => ({ from: moved(l.from), to: moved(l.to) })),
    divider: laid.divider && { from: laid.divider.from, to: { x: laid.divider.to.x, y: bottom } },
  }
}

export function dirPrintSheets(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | undefined; purpose: SheetPurpose },
): PrintSheets {
  const laid = on.purpose === "print" ? printLaid(catalog, page, on) : laidPage(catalog, page, on)
  const paper = paperSize(catalog, page)
  if (!laid || !paper) return { columns: 1, rows: 1, filled: new Set() }
  const notes = laid.notes
  const rects: Rect[] = [
    ...laid.rows,
    ...(notes ? laid.rows.filter(r => r.note).map(r => ({ x: notes.x, y: r.y, w: notes.w, h: r.h })) : []),
  ]
  return printSheetsOf(paper, rects, on.grow, laidExtentOf(laid))
}
