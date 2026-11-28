// 窓が中身を持つ物: 全部のブックスクリーンの全部のステージが開いているステージエントリと、それを描くのに中身を使うページのステージエントリ
// （参照エントリの指す先・形が描くのに使うページ〈ShapeItemDef の drawsFrom〉。たどった先が、また使う物も）。ほかのページは、ページメタだけを持てばよい

import { pagesOf } from "./book"
import type { CoreCatalog } from "./core-catalog"
import type { ShapeItemDef } from "./def/item"
import { NO_OUTERMOST, outermostOf, outsideBinderIn, outsidePageIn } from "./folders-tree"
import type { LibraryAndBooks } from "./library"
import { type ItemPage, slideOf, walkShapes } from "./placed"
import { bookLineupOf, referredOf, UNSEEN } from "./references"
import { NOTHING_OPENED } from "./stage"
import type { WindowState } from "./window"

// 窓 win が中身を持つステージエントリの id（並びは id の順）。描くのに使うページは、中身を持っているページからだけたどる
// （まだ持っていない物の先は、その中身を持ってから、もう一度これで決める）
export function keptEntriesIn(catalog: CoreCatalog, from: LibraryAndBooks, win: WindowState): readonly string[] {
  const kept = new Set<string>()
  const todo: string[] = []
  const keep = (id: string) => {
    if (kept.has(id)) return
    kept.add(id)
    todo.push(id)
  }
  const keepOuter = (id: string) => {
    const outer = outermostOf(from, id)
    if (outer !== NO_OUTERMOST) keep(outer.id)
  }
  for (const screen of win.screens)
    for (const stage of screen.stages?.stages ?? [])
      if (stage.opened !== NOTHING_OPENED) keep(stage.opened.outermost.id)
  for (let id = todo.pop(); id !== undefined; id = todo.pop()) {
    for (const ref of bookLineupOf(from.folders, id)) {
      if (ref.kind !== "reference") continue
      const found = referredOf(from, ref)
      if (found !== UNSEEN) keepOuter(found.kind === "page" ? found.page.id : found.binder.id)
    }
    for (const page of heldPagesOf(from, id)) for (const to of pagesDrawnOn(catalog, page)) keepOuter(to)
  }
  return [...kept].sort()
}

// ステージエントリ id の、中身を持っているページ（ブック・ブックの外のバインダの中のページ、ブックの外のページ）
function heldPagesOf(from: LibraryAndBooks, id: string): readonly ItemPage[] {
  const book = from.books[id]
  if (book) return pagesOf(book)
  const page = outsidePageIn(from, id)
  if (page) return [page]
  return outsideBinderIn(from, id)?.lineup ?? []
}

// ページ page の形が描くのに中身を使うページの id（紙の上の形と、形だけの並び〈スライド〉の形を、入れ子ごと。ShapeItemDef の drawsFrom）。
// only を渡せば、その定義の形の分だけ
export function pagesDrawnOn(
  catalog: CoreCatalog,
  page: ItemPage,
  only: (def: ShapeItemDef) => boolean = () => true,
): readonly string[] {
  const shapes = [...walkShapes(page), ...walkShapes({ ...page, items: slideOf(page) })]
  return shapes.flatMap(({ shape }) => {
    const def = catalog.items.get(shape.item)
    return def?.kind === "shape" && only(def) ? (def.drawsFrom?.(shape) ?? []) : []
  })
}
