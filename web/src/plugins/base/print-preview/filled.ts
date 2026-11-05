// 印刷区画に何かが載っているか（書く画面で何も載っていない印刷区画を暗くし、印刷プレビューでは並べない。両方がこの判定を使う）。
// 形が載る印刷区画は 1 つで、縦と横それぞれ、形の始めがある印刷区画から形の半分以上がはみ出していれば次の印刷区画（sheetsOfShape）。
// 印刷区画より大きい形は、掛かっている印刷区画のどれにも載る。
// つなぐもの（線など）は、手で決めた所を表す点（定義の printBelongingPoints。線では手で直した区間の折れ目）がある印刷区画に載る（両端は形の印刷区画に載るので数えない。
// 通り抜けるだけの印刷区画には載らない）。判定できるのは、アイテムの位置をデータに持つタイプ（置けるアイテムのあるタイプ）だけ。
// ほかのタイプは null（どの印刷区画も載っているとして扱う）
import { bookItems } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Rect, Size } from "../../../core/geom"
import { byConnector, type ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { paperSize } from "../place/items"
import { portAreasOf, rectsOf } from "../place/placed"

// 印刷区画の鍵（列,行）
export const sheetKey = (column: number, row: number): string => `${column},${row}`

// 長さ len の印刷区画を並べた向きで、始め at・長さ size の形が載る印刷区画の番号
function cellsAlong(at: number, size: number, len: number): number[] {
  const first = Math.max(0, Math.floor(at / len))
  if (size > len) {
    const last = Math.max(first, Math.ceil((at + size) / len) - 1)
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }
  const over = at + size - (first + 1) * len
  return [over * 2 >= size ? first + 1 : first]
}

// 四角 r の形が載る印刷区画（紙の大きさ paper で区切ったうちの列と行。印刷区画より大きければ掛かる印刷区画の全部）
export function sheetsOfShape(r: Rect, paper: Size): { column: number; row: number }[] {
  return cellsAlong(r.x, r.w, paper.w).flatMap(column => cellsAlong(r.y, r.h, paper.h).map(row => ({ column, row })))
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
