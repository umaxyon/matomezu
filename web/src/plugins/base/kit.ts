// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/base: を付ける）
import { pluginKit } from "../../store/kit"
import { BASE_MESSAGES } from "./messages"

export const kit = pluginKit("@matomezu/base", BASE_MESSAGES)
