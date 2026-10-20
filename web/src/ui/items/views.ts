// アイテムごとのビュー。core の登録表（core/registry.ts の ITEMS）のアイテムは、全部ここにビューを持つ（抜けると型の誤り）。
// ビューは、そのアイテムの項目の形（props）のデータを受け取る
import type { ComponentType } from "react"
import type { ItemId, ItemProps } from "../../core/registry"
import { BoxView } from "./BoxView"

export const ITEM_VIEWS: { [K in ItemId]: ComponentType<{ props: ItemProps<K> }> } = {
  "shape.box": BoxView,
}
