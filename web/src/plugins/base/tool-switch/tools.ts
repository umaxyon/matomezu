// base の道具: 選択（アイテムを置き、選んで動かす）とハンド（ステージをドラッグすると紙をずらす）。組にまとめるのは、道具を使う見せ方のプラグイン
import { kit } from "../kit"

export const SELECT_TOOL = kit.defineTool({ id: "select", title: "Select tool", places: true })
export const HAND_TOOL = kit.defineTool({ id: "hand", title: "Hand tool", pans: true })
