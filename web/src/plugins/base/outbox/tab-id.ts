// 送信トレイのタブ（左サイドパネルのタブのウィジェット outbox）の id と、渡す物。開く側（郵便箱のボタン・しおり）と中身の両方が読む
import { kit } from "../kit"

export const OUTBOX_TAB_ID = kit.name("outbox")

// 送信トレイのタブに渡す物: 開くステージ（そのステージで開いているブックの伝言を出す）
export interface OutboxProps {
  stage: string
}
