// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/scrap: を付ける）
import { pluginKit } from "../../../plugin-api"
import { SCRAP_BOX_MESSAGES } from "./messages"

export const kit = pluginKit("@matomezu/scrap", SCRAP_BOX_MESSAGES)
