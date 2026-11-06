// 郵便の種類の定義: 郵便箱（利用者に 1 つ）に届く郵便の種類（base の手紙など）。プラグインが種類を足す。
// 郵便のデータは { id, mail（種類の id）, from, sentAt, to?, seenAt?, visitedAt?, props（種類ごとの形） }（core/mail.ts）。
// core が知るのは種類ごとの形のほかの所だけで、props の形は種類が決める
import type { z } from "zod"
import type { MailExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface MailDef<P extends z.ZodType = z.ZodType, Tt extends string = MessageKey> extends MailExtras {
  id: string // 本当の id（例: @matomezu/base:letter）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。何のための物で、AI がどう送るか）
  props: P // 種類ごとの形
}
