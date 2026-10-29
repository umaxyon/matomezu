// ツールボックス: ブックで置けるアイテムのうち、ツールボックスに出すもの（並びはブックのタイプの規定の順）。
// ボタンで出すものと、形のパネル（「形」のボタン 1 つから開く格子）に並べるものがある。どこにどう出すか（上の行・ドロワーなど）はビューと配置が決める
import { bookItems } from "../../../core/book"
import type { CoreCatalog, ItemId } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { Book } from "../../../core/schema/book"

// ツールボックスに出すか（定義オブジェクトの拡張ポイントに書き足す）。true はボタンで出し、"panel" は形のパネルに並べる。
// 出さない形（false）は、ほかの操作で置く。つなぐものは出さない（形どうしを結ぶ操作で引く）
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    toolbox: boolean | "panel"
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    toolbox: false
  }
}

const placedBy = (catalog: CoreCatalog, book: Book, how: true | "panel"): readonly ItemId[] =>
  bookItems(catalog, book).filter((id): id is ItemId => catalog.items.get(id)?.toolbox === how)

// ボタンで出すアイテム
export const toolboxOf = (catalog: CoreCatalog, book: Book): readonly ItemId[] => placedBy(catalog, book, true)

// 形のパネルに並べるアイテム
export const panelOf = (catalog: CoreCatalog, book: Book): readonly ItemId[] => placedBy(catalog, book, "panel")
