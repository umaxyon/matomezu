// 郵便の種類の定義: 郵便箱（利用者に 1 つ）に届く郵便の種類（base の手紙 @matomezu/base:letter など）。プラグインが種類を足す。
// 郵便のデータは { id, mail（種類の id）, from, sentAt, to?, seenAt?, visitedAt?, props（種類ごとの形） }（core/mail.ts）。
// core が知るのは種類ごとの形のほかの所だけで、props の形は種類が決める
import type { z } from "zod"
import type { MailExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface MailDef<P extends z.ZodType = z.ZodType, Tt extends string = MessageKey> extends MailExtras {
  id: string // 本当の id（例: @matomezu/base:letter）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。MCP の actions の mails で見せる。何のための物で、AI がどう送るか）
  props: P // 種類ごとの形
  // AI に郵便の一覧で見せる 1 行（1 通ずつを見分ける題。利用者が書いた文はそのまま、決まった言葉は英語で返す）。長さは core が切る（切れたら「…」と全体の字数が付く）。
  // 無ければ、一覧には種類の id だけで見分ける。画面の題（shown の title）とは別
  aiBrief?(props: z.output<P>): string
}
