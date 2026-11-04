// 印刷区画に何かが載っているか（書く画面で何も載っていない印刷区画を暗くし、印刷プレビューでは並べない。両方がこの判定を使う）。
// 形は、プレビューと印刷で寄せる先の印刷区画に載る: はみ出しが形の半分より小さければ始めの区画、半分以上なら次の区画（縦と横それぞれ）。
// 区画より大きい形は寄せられないので、掛かっている区画のどれにも載る。
// つなぐもの（線など）は、手で決めた点（定義の printPoints）が入っている区画に載る（両端は形の区画に載るので数えない。通り抜けるだけの区画には載らない）。
// 判定できるのは、アイテムの位置をデータに持つタイプ（置けるアイテムのあるタイプ）だけ。ほかのタイプは null（どの区画も載っているとして扱う）
import type { CoreCatalog } from "../../../core/core-catalog"
import { byConnector, type ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { paperSize } from "../place/items"
import { portAreasOf, rectsOf } from "../place/placed"

// 区画の鍵（列,行）
export const sheetKey = (column: number, row: number): string => `${column},${row}`

// 長さ len の区画を並べた向きで、始め at・長さ size の形が載る区画の番号（区画より大きければ掛かる区画全部）
function cellsAlong(at: number, size: number, len: number): number[] {
  const first = Math.max(0, Math.floor(at / len))
  if (size > len) {
    const last = Math.max(first, Math.ceil((at + size) / len) - 1)
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }
  const over = at + size - (first + 1) * len
  return [over * 2 >= size ? first + 1 : first]
}

// ブック book のページ page で、何かが載っている印刷区画の鍵（判定できないタイプなら null）
export function filledSheets(catalog: CoreCatalog, book: Book, page: ItemPage): ReadonlySet<string> | null {
  const paper = paperSize(catalog, page)
  if (!paper || (catalog.bookTypes.get(book.type)?.items.allowed.length ?? 0) === 0) return null
  const filled = new Set<string>()
  const rects = rectsOf(catalog, page)
  for (const r of rects.values())
    for (const c of cellsAlong(r.x, r.w, paper.w))
      for (const row of cellsAlong(r.y, r.h, paper.h)) filled.add(sheetKey(c, row))
  const areas = portAreasOf(catalog, page, rects)
  const setting = settingsAt(catalog, book, page)
  for (const [def, list] of byConnector(catalog, page))
    for (const p of def.printPoints?.(list, areas, setting) ?? [])
      filled.add(sheetKey(Math.max(0, Math.floor(p.x / paper.w)), Math.max(0, Math.floor(p.y / paper.h))))
  return filled
}
