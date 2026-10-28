// 文字: 文字の項目と寸法（fields.ts）・幅と折り返し（text.ts）と、本文の装飾（rich.ts。太字と文字の色）・base の文字の色（colors.ts）・ブックの文字の色の上書き（text-colors.ts）
export { TEXT_COLORS } from "./colors"
export { clampRich, parseRich, plainOf, type RichLine, type Run, textColorId, textColorRef, wrapRich } from "./rich"
export { BOOK_TEXT_COLORS, textColorsOf, textColorVars } from "./text-colors"
