// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/tree: を付ける）
import { pluginKit } from "../../../plugin-api"
import { TREE_MESSAGES } from "./messages"

export const kit = pluginKit("@matomezu/tree", TREE_MESSAGES)
