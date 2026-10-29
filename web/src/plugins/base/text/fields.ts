// 文字を持つ形（箱とリスト。リストの行も）が共に持つ文字の項目と、文字の寸法: キャプション・区切り線・本文と、キャプションと本文の寄せ。
// 文字の幅と折り返しは text.ts で計算する（画面でも常駐でも同じ行になる）
import { z } from "zod"
import { type Font, textWidth } from "./text"

// 文の寄せ（左・中央・右）
export const AlignSchema = z.enum(["left", "center", "right"])
export type Align = z.infer<typeof AlignSchema>

export const BODY_MAX = 2000 // 本文の字数の上限
export const PLACE_CAPTION = 20 // 置いたときに幅を取るキャプションの字の数の上限（超えた分は … で切れる）
export const PLACE_LINES = 5 // 置いたときに見せる本文の行の数の上限

// 文字の寸法（px。どのテーマでも同じ）
export const TEXT_LOOK = {
  padX: 8, // キャプションの左右の余白
  padY: 4, // キャプションの上下の余白
  line: 18, // 1 行の高さ
  ruleGap: 3, // 区切り線の上下の間（線は 1px）
  caption: { size: 13, weight: 700 } satisfies Font,
  body: { size: 13, weight: 400 } satisfies Font,
} as const

// 本文の形（装飾の書き方を AI に見せる。本文を持つ形とブックのタイプが共に使う）
export const bodyText = () =>
  z
    .string()
    .max(BODY_MAX)
    .describe(
      "Text with line breaks. **bold** makes it bold and {name:text} colors it with a text color (name from textColors, such as {warn:text}); unpaired marks stay as they are, and a \\ before *, {, } or \\ keeps that character as it is",
    )

// 文字の項目の形（既定を付ける前）。使う側が既定を付ける（キャプションの寄せの既定は形ごとに違う）
export const textFields = () => ({
  caption: z.string(),
  rule: z.boolean(), // キャプションと本文の間の区切り線（本文があるときだけ引く）
  body: bodyText(),
  captionAlign: AlignSchema, // キャプションの寄せ
  bodyAlign: AlignSchema, // 本文の寄せ
})
type TextFields = ReturnType<typeof textFields>

// 文字の項目に既定を付けた形（キャプションの寄せの既定は captionAlign、本文は左）
export const textProps = (captionAlign: Align) => {
  const f = textFields()
  return {
    caption: f.caption.default(""),
    rule: f.rule.default(true),
    body: f.body.default(""),
    captionAlign: f.captionAlign.default(captionAlign),
    bodyAlign: f.bodyAlign.default("left"),
  }
}

// 書いた項目だけを変える形（書かなければそのまま、null は消して既定に戻す）
export const textPatch = (): { [K in keyof TextFields]: z.ZodOptional<z.ZodNullable<TextFields[K]>> } => {
  const f = textFields()
  return {
    caption: f.caption.nullable().optional(),
    rule: f.rule.nullable().optional(),
    body: f.body.nullable().optional(),
    captionAlign: f.captionAlign.nullable().optional(),
    bodyAlign: f.bodyAlign.nullable().optional(),
  }
}

// 足すときの形（書かなかった項目は既定）
export const textNew = (): { [K in keyof TextFields]: z.ZodOptional<TextFields[K]> } => {
  const f = textFields()
  return {
    caption: f.caption.optional(),
    rule: f.rule.optional(),
    body: f.body.optional(),
    captionAlign: f.captionAlign.optional(),
    bodyAlign: f.bodyAlign.optional(),
  }
}

// キャプションが PLACE_CAPTION 字まで切れずに見える文字の幅（超えるなら、その字数と … の幅。余白は含まない）
export function captionTextWidth(caption: string): number {
  const chars = [...caption]
  const shown = chars.length > PLACE_CAPTION ? `${chars.slice(0, PLACE_CAPTION).join("")}…` : caption
  return Math.ceil(textWidth(shown, TEXT_LOOK.caption))
}
