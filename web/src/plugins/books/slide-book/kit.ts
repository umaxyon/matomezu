// このプラグインの定義の関数の組（自分の物を短い名前で書き、頭 @matomezu/slide-book: を付ける）
import { pluginKit } from "../../../plugin-api"
import { SLIDE_BOOK_MESSAGES } from "./messages"

export const kit = pluginKit("@matomezu/slide-book", SLIDE_BOOK_MESSAGES)
