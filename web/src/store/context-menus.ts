// 右クリックのメニュー。画面に出すのは 1 つだけで、どれを出すかは id、どこで開いたかは stage、
// 何を右クリックしたかは target、どこに出すかは at（画面の座標）で決まる。
// メニューの id と受け取る物の型、中身（コマンドの並び）は ui が持つ（core/catalog.ts の ContextMenuTable と配置の contextMenus）
import type { Point } from "../core/geom"

export interface OpenedContextMenu {
  id: string
  stage: string // 開いたステージ。項目のコマンドはこのステージから呼ぶ
  target: unknown // 右クリックされた物。項目のコマンドに引数として渡す
  at: Point
}
