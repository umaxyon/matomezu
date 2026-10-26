// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/box: を付ける）
import { pluginKit } from "../../../plugin-api"
import { BOX_MESSAGES } from "./messages"

export const kit = pluginKit("@matomezu/box", BOX_MESSAGES)
