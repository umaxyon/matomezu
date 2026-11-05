// 印刷区画に何かが載っているか（書く画面で何も載っていない印刷区画を暗くし、印刷プレビューでは並べない。両方がこの判定を使う）。
// 形が載る印刷区画は 1 つで、縦と横それぞれ、形の始めがある印刷区画から形の半分以上がはみ出していれば次の印刷区画（sheetsOfShape）。
// プレビューと印刷では、形をその印刷区画の中へ寄せて描く（snapShift）。
// 印刷区画より大きい形は、掛かっている印刷区画のどれにも載る。
// つなぐもの（線など）は、手で決めた所を表す点（定義の printBelongingPoints。線では手で直した区間の折れ目）がある印刷区画に載る（両端は形の印刷区画に載るので数えない。
// 通り抜けるだけの印刷区画には載らない）。判定できるのは、アイテムの位置をデータに持つタイプ（置けるアイテムのあるタイプ）だけ。
// ほかのタイプは null（どの印刷区画も載っているとして扱う）
import { bookItems } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Point, Rect, Size } from "../../../core/geom"
import { byConnector, type ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { type GrowSides, grownArea } from "../place/grow"
import { paperSize } from "../place/items"
import { portAreasOf, rectsOf } from "../place/placed"
import type { PrintSheets } from "."

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

// 四角 r の形を、載る印刷区画の中へ寄せる量（プレビューと印刷のときだけ。データは変えない）。はみ出していなければ、
// また印刷区画より大きく寄せられなければ null
export function snapShift(r: Rect, paper: Size): Point | null {
  const sheets = sheetsOfShape(r, paper)
  const sheet = sheets.length === 1 ? sheets[0] : undefined
  if (!sheet) return null
  const into = (at: number, size: number, start: number, len: number) =>
    at < start ? start - at : at + size > start + len ? start + len - (at + size) : 0
  const x = into(r.x, r.w, sheet.column * paper.w, paper.w)
  const y = into(r.y, r.h, sheet.row * paper.h, paper.h)
  return x === 0 && y === 0 ? null : { x, y }
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
