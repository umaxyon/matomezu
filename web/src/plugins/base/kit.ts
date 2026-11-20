// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/base: を付ける）
import { pluginKit } from "../../store/kit"
import { BASE_MESSAGES } from "./messages"
import type { BASE_ID } from "./utils/plugin-id"

export const kit = pluginKit("@matomezu/base" satisfies typeof BASE_ID, BASE_MESSAGES)
