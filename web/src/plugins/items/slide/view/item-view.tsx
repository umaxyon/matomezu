// スライドのアイテムを描く所（レイヤーのアイテム・紙・置こうとしている途中の見え方）が引く、その種類のビューと、
// そのプラグインのテーマキー（--<名前>）の値。描く要素の style に tokens を置き、その中に View を描く
import type { ComponentType, CSSProperties } from "react"
import type { PlacedShape } from "../../../../plugin-api"
import { type ItemViewProps, useTokenScope, useUiCatalog } from "../../../../plugin-api/ui"

export type SlideItemView = ComponentType<ItemViewProps<PlacedShape["props"]>>

export function useSlideItemView(item: string): { View: SlideItemView | undefined; tokens: CSSProperties } {
  const ui = useUiCatalog()
  const tokens = useTokenScope(item)
  return { View: ui.items.get(item)?.view as SlideItemView | undefined, tokens }
}
