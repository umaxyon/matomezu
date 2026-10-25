// ツールボックス: ブックで置けるアイテムのうち、ツールボックスに出すもの（並びはブックのタイプの規定の順）。
// どこにどう出すか（上の行・右クリックのメニューなど）は ui が決める
import { bookItems } from "./book"
import type { CoreCatalog, ItemId } from "./core-catalog"
import type { Book } from "./schema/book"

export function toolboxOf(reg: CoreCatalog, book: Book): readonly ItemId[] {
  return bookItems(reg, book).filter((id): id is ItemId => reg.items.get(id)?.toolbox === true)
}
