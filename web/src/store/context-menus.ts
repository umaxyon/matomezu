// 右クリックのメニュー。画面に出すのは 1 つだけで、どれを出すかは id、どこで開いたかは stage と screen（ダイアログと同じ決まり）、
// 何を右クリックしたかは target、どこに出すかは at（画面の座標）と opens（at から下へ開くか、上へ開くか）で決まる。
// メニューの id と受け取る物の型、中身（コマンドの並び）は ui が持つ（core/catalog.ts の ContextMenuTable と UI マッピングの contextMenus）
import type { Point } from "../core/geom"
import { NO_STAGE } from "./dialogs"

export interface OpenedContextMenu {
  id: string
  stage: string // 開いたステージ（ステージを持たないスクリーンから開いたら NO_STAGE）
  screen: string // 開いたスクリーン（ステージから開いたら、それを並べているスクリーン）
  target: unknown // 右クリックされた物。項目のコマンドに引数として渡す
  at: Point
  opens: MenuOpens
}

// メニューを開く向き: down は at を左上にして下へ、up は at を左下にして上へ（画面の下にあるボタンから開くとき）
export type MenuOpens = "down" | "up"

// メニュー menu を開いた場所（ステージの id。ステージを持たずに開いたら、スクリーンの id）。項目のコマンドは、ここから呼ぶ
export const openedAt = (menu: Pick<OpenedContextMenu, "stage" | "screen">): string =>
  menu.stage !== NO_STAGE ? menu.stage : menu.screen
