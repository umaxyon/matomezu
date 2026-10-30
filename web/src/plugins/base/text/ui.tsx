// 文字の見た目: 文字の色の設定の項目のビューと、装飾した本文を描くコンポーネント・装飾のボックス・本文の入力Form

import { TextColorsSetting } from "./TextColorsSetting"
import { BOOK_TEXT_COLORS } from "./text-colors"

export { RichBar } from "./RichBar"
export { RichBody } from "./RichBody"
export { RichInput, type RichInputHandle } from "./RichInput"
export { RichText } from "./RichText"
export { TextBlockView } from "./TextBlockView"

export const TEXT_SETTING_VIEWS = { [BOOK_TEXT_COLORS.id]: { control: TextColorsSetting } }
