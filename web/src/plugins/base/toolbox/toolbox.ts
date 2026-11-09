// ツールボックス: ステージが直している並びで置けるアイテム（placeableIn）のうち、定義の toolbox で出すもの（並びはその順）。
// ボタンで出すものと、シェイプパネル（「形」のボタン 1 つから開く格子）に並べるものがある。どこにどう出すか（上の行・フッタメニューなど）はビューと UI マッピングが決める
import { bookType, type CoreCatalog, type ItemId } from "../../../core/core-catalog"
import { type EditList, placeableIn } from "../../../core/def/book-type"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { Book } from "../../../core/schema/book"

// ツールボックスに出すか（定義オブジェクトの拡張ポイントに書き足す）。true はボタンで出し、"panel" はシェイプパネルに並べる。
// 出さない形（false）は、ほかの操作で置く。つなぐものは出さない（形どうしを結ぶ操作で引く）
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    toolbox: boolean | "panel"
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    toolbox: false
  }
}

const placedBy = (catalog: CoreCatalog, book: Book, how: true | "panel", edits: EditList): readonly ItemId[] =>
  placeableIn(bookType(catalog, book.type), edits).filter((id): id is ItemId => catalog.items.get(id)?.toolbox === how)

// ボタンで出すアイテム（edits はステージが直している並び。背景編集モードの間は、背景に置く形だけ）
export const toolboxOf = (catalog: CoreCatalog, book: Book, edits: EditList): readonly ItemId[] =>
  placedBy(catalog, book, true, edits)

// シェイプパネルに並べるアイテム
export const panelOf = (catalog: CoreCatalog, book: Book, edits: EditList): readonly ItemId[] =>
  placedBy(catalog, book, "panel", edits)
