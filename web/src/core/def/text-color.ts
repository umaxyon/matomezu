// 文字の色の定義: 本文の一部に付ける、意味の役割の色（成功・情報・注意・誤りなど）。テーマに寄らない色（#rrggbb）を持つ。
// 使い方と、ブックの設定などでの上書きは、使うプラグインが決める
import type { TextColorExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface TextColorDef extends TextColorExtras {
  id: string
  title: MessageKey
  color: string // #rrggbb
  aiDescription: string // AI に見せる、役割の意味（英語）
}

export function defineTextColor<const T extends TextColorDef>(def: T): T {
  return def
}
