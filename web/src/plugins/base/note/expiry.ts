// 伝言期限: 読まれたあと、利用者が AI に話しかけてから伝言が消えるまでの時間（利用者の設定の項目）と、消える時点の計算
import { z } from "zod"
import { kit } from "../kit"

// 選べる伝言期限: 分の数（0 は話しかけたらすぐ）と、消さない（never）
export const NOTE_EXPIRY_CHOICES = ["0", "5", "15", "30", "60", "480", "never"] as const
export const NOTE_EXPIRY = kit.defineSetting({
  id: "note-expiry",
  title: "Note expiry",
  schema: z.enum(NOTE_EXPIRY_CHOICES),
  default: "60",
  optionTitles: {
    "0": kit.message("Right away"),
    "5": kit.message("5 minutes"),
    "15": kit.message("15 minutes"),
    "30": kit.message("30 minutes"),
    "60": kit.message("60 minutes"),
    "480": kit.message("8 hours"),
    never: kit.message("Never"),
  },
})

// 会話の時点 talkedAt から、伝言期限 choice（設定の値。形に合わなければ既定）が過ぎる時点（消さないなら null）
export function expiryFrom(talkedAt: string, choice: unknown): string | null {
  const parsed = NOTE_EXPIRY.schema.safeParse(choice)
  const value = parsed.success ? parsed.data : NOTE_EXPIRY.default
  if (value === "never") return null
  const ms = Date.parse(talkedAt) + Number(value) * 60_000
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
