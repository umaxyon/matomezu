// ツールボックス: ブックで置けるアイテムのうち、ツールボックスに出すもの（並びはブックのタイプの規定の順）。
// どこにどう出すか（上の行・右クリックのメニューなど）は ui が決める
import { bookItems } from "../../../core/book"
import type { CoreCatalog, ItemId } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { Book } from "../../../core/schema/book"

// ツールボックスに出すか（定義オブジェクトの拡張ポイントに書き足す）。出さない形は、ほかの操作で置く。つなぐものは出さない（形どうしを結ぶ操作で引く）
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    toolbox: boolean
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    toolbox: false
  }
}

export function toolboxOf(catalog: CoreCatalog, book: Book): readonly ItemId[] {
  return bookItems(catalog, book).filter((id): id is ItemId => catalog.items.get(id)?.toolbox === true)
}
