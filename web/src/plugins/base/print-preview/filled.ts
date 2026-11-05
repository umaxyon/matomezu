// 印刷区画に何かが載っているか（書く画面で何も載っていない印刷区画を暗くし、印刷プレビューでは並べない。両方がこの判定を使う）。
// 形は、掛かっている印刷区画のどれにも載る（sheetsOfShape。またいだ形は、プレビューと印刷では紙の境目で切れる）。
// 利用者が手で置く図のタイプは、またいだ形を印刷プレビューの前に直してもらう（crossingShapes。印刷区画より大きい形は直せないので、切れてよい）。
// つなぐもの（線など）は、手で決めた所を表す点（定義の printBelongingPoints。線では手で直した区間の折れ目）がある印刷区画に載る（両端は形の印刷区画に載るので数えない。
// 通り抜けるだけの印刷区画には載らない）。判定できるのは、アイテムの位置をデータに持つタイプ（置けるアイテムのあるタイプ）だけ。
// ほかのタイプは null（どの印刷区画も載っているとして扱う）
import { bookItems } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Rect, Size } from "../../../core/geom"
import { byConnector, type ItemPage, type PlacedShape, shapesOf } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { type GrowSides, grownArea } from "../place/grow"
import { paperSize } from "../place/items"
import { placedSize, portAreasOf, rectsOf } from "../place/placed"
import type { PrintSheets } from "."

// 印刷区画の鍵（列,行）
export const sheetKey = (column: number, row: number): string => `${column},${row}`

// 長さ len の印刷区画を並べた向きで、始め at・長さ size の形が掛かる印刷区画の番号（端がちょうど境目なら、次の印刷区画には掛からない）
function cellsAlong(at: number, size: number, len: number): number[] {
  const first = Math.max(0, Math.floor(at / len))
  const last = Math.max(first, Math.ceil((at + size) / len - 1e-9) - 1)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

// 四角 r の形が載る印刷区画（紙の大きさ paper で区切ったうちの、掛かっている印刷区画の列と行）
export function sheetsOfShape(r: Rect, paper: Size): { column: number; row: number }[] {
  return cellsAlong(r.x, r.w, paper.w).flatMap(column => cellsAlong(r.y, r.h, paper.h).map(row => ({ column, row })))
}

// ページ page の直下の形のうち、印刷区画の境目をまたぐ形の id（crossing。動かせば 1 つの印刷区画に入る）と、
// 印刷区画より大きくて、どこへ動かしてもまたぐ形の id（oversized）
export function crossingShapes(
  catalog: CoreCatalog,
  page: ItemPage,
): { crossing: readonly string[]; oversized: readonly string[] } {
  const paper = paperSize(catalog, page)
  const crossing: string[] = []
  const oversized: string[] = []
  if (!paper) return { crossing, oversized }
  for (const item of shapesOf(page)) {
    const size = placedSize(catalog, item)
    if (!size || sheetsOfShape({ x: item.x, y: item.y, ...size }, paper).length < 2) continue
    if (size.w > paper.w || size.h > paper.h) oversized.push(item.id)
    else crossing.push(item.id)
  }
  return { crossing, oversized }
}

// 中身の四角 rects（紙の座標）を並べたページの印刷区画（見せ方の printSheets が返す形）: 可変ページ（増やす向き grow）なら、中身の外枠 extent が
// 入るだけ印刷区画を並べた数、そうでなければ 1 つ。中身の四角が載る印刷区画（形と同じ決まり。sheetsOfShape）を、載っている印刷区画にする
export function printSheetsOf(
  paper: Size,
  rects: readonly Rect[],
  grow: GrowSides | undefined,
  extent: Rect | null,
): PrintSheets {
  const filled = new Set(rects.flatMap(r => sheetsOfShape(r, paper).map(c => sheetKey(c.column, c.row))))
  if (!grow) return { columns: 1, rows: 1, filled }
  const { columns, rows } = grownArea(paper, grow, extent, false)
  return { columns, rows, filled }
}

// ページ page を紙の大きさ paper で区切ったうち、column 列目・row 行目の印刷区画を描くときの形: ページの直下の形全部（shapes。つなぐものは
// 全部の形の位置で引く）と、そのうちこの印刷区画に掛かる形（here）
export function sheetShapes(
  catalog: CoreCatalog,
  page: ItemPage,
  paper: Size,
  column: number,
  row: number,
): { shapes: readonly PlacedShape[]; here: readonly PlacedShape[] } {
  const shapes = shapesOf(page)
  const on = (item: PlacedShape) => {
    const size = placedSize(catalog, item)
    return (
      !!size && sheetsOfShape({ x: item.x, y: item.y, ...size }, paper).some(c => c.column === column && c.row === row)
    )
  }
  return { shapes, here: shapes.filter(on) }
}

// ブック book のページ page で、何かが載っている印刷区画の鍵（判定できないタイプなら null）
export function filledSheets(catalog: CoreCatalog, book: Book, page: ItemPage): ReadonlySet<string> | null {
  const paper = paperSize(catalog, page)
  if (!paper || bookItems(catalog, book).length === 0) return null
  const filled = new Set<string>()
  const rects = rectsOf(catalog, page)
  for (const r of rects.values()) for (const c of sheetsOfShape(r, paper)) filled.add(sheetKey(c.column, c.row))
  const areas = portAreasOf(catalog, page, rects)
  const setting = settingsAt(catalog, book, page)
  for (const [def, list] of byConnector(catalog, page))
    for (const p of def.printBelongingPoints?.(list, areas, setting) ?? [])
      filled.add(sheetKey(Math.max(0, Math.floor(p.x / paper.w)), Math.max(0, Math.floor(p.y / paper.h))))
  return filled
}
