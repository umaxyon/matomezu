// 型を書き足す口（画面の配置の分。空の interface は、書き足しを受けるためのもの。type にすると書き足せない）。
// スロットは「id → そこに置くウィジェットが受け取る値」。スロットを描くウィジェットを持つプラグインが、そのスロットを書き足す
export interface SlotTable {
  app: Record<string, never> // 画面の根（土台が描く、ただ 1 つのスロット）
}
export interface WidgetTable {}
export interface MenuTable {} // メニューの id → true

export type SlotId = keyof SlotTable & string
export type WidgetId = keyof WidgetTable & string
export type MenuId = keyof MenuTable & string
export type SlotProps<S extends SlotId> = SlotTable[S]
