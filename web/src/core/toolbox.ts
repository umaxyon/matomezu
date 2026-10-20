// ツールボックス: ブックで置けるアイテムのうち、ツールボックスに出すもの（並びはブックのタイプの規定の順）。
// どこにどう出すか（上の行・右クリックのメニューなど）は ui が決める
import { bookType, type ItemId, itemDef } from "./registry"
import type { Book } from "./schema/book"

export function toolboxOf(book: Book): readonly ItemId[] {
  return bookType(book.type).items.defaults.filter((id): id is ItemId => itemDef(id)?.toolbox === true)
}
