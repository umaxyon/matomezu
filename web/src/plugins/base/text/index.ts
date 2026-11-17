// 文字: 文字の項目と寸法（fields.ts）・幅と折り返し（text.ts）と、本文の装飾（rich.ts。太字と文字の色）・base の文字の色（colors.ts）・ブックと利用者の文字の色の上書き（text-colors.ts）

export {
  type BlockProps,
  type BodyColumn,
  blockBodyHeight,
  blockBodyLines,
  blockEmpty,
  blockLabel,
  bodyColumn,
  bodyMinWidth,
  bodyWidthAfter,
  type TextBlock,
  textBlock,
  textBlockHeight,
} from "./block"
export { TEXT_COLORS } from "./colors"
export {
  AlignSchema,
  BODY_MAX,
  bodyText,
  captionTextWidth,
  PLACE_LINES,
  TEXT_LOOK,
  textNew,
  textPatch,
  textProps,
} from "./fields"
export {
  clampRich,
  parseRich,
  plainOf,
  type RichLine,
  type Run,
  richWidth,
  textColorId,
  textColorRef,
  wrapRich,
} from "./rich"
export type { Font, Weight } from "./text"
export { clampLines, textWidth, wrap } from "./text"
export {
  PAGE_TEXT_COLORS,
  THEME_TEXT_COLORS_CHECK,
  textColorsOf,
  textColorVars,
  USER_TEXT_COLORS,
} from "./text-colors"
