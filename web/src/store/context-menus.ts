// 右クリックのメニュー。画面に出すのは 1 つだけで、どれを出すかは id、どこで開いたかは stage、
// 何を右クリックしたかは target、どこに出すかは at（画面の座標）と opens（at から下へ開くか、上へ開くか）で決まる。
// メニューの id と受け取る物の型、中身（コマンドの並び）は ui が持つ（core/catalog.ts の ContextMenuTable と UI マッピングの contextMenus）
import type { Point } from "../core/geom"

export interface OpenedContextMenu {
  id: string
  stage: string // 開いたステージ。項目のコマンドはこのステージから呼ぶ
  target: unknown // 右クリックされた物。項目のコマンドに引数として渡す
  at: Point
  opens: MenuOpens
}

// メニューを開く向き: down は at を左上にして下へ、up は at を左下にして上へ（画面の下にあるボタンから開くとき）
export type MenuOpens = "down" | "up"
