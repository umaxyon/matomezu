// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/network: を付ける）
import { pluginKit } from "../../plugin-api"
import { NETWORK_MESSAGES } from "./messages"

export const kit = pluginKit("@matomezu/network", NETWORK_MESSAGES)
