// 伝言期限: 読まれたあと、利用者が AI に話しかけてから伝言が消えるまでの時間（利用者の設定の項目）と、消える時点の計算
import { z } from "zod"
import { kit } from "../kit"

// 伝言期限（利用者の設定の項目）: 読まれたあと、利用者が AI に話しかけてから伝言が消えるまでの時間。選べる時間は固定の並び（値は設定の画面のセレクトForm に出る文字）
export const NOTE_EXPIRY_CHOICES = ["1", "2", "4", "8", "24"] as const
export const NOTE_EXPIRY = kit.defineSetting({
  id: "note-expiry",
  title: "Note expiry (hours)",
  schema: z.enum(NOTE_EXPIRY_CHOICES),
  default: "2",
})

// 会話の時点 talkedAt から、伝言期限 hours（設定の値。形に合わなければ既定）が過ぎる時点
export function expiryFrom(talkedAt: string, hours: unknown): string | null {
  const parsed = NOTE_EXPIRY.schema.safeParse(hours)
  const ms = Date.parse(talkedAt) + Number(parsed.success ? parsed.data : NOTE_EXPIRY.default) * 3_600_000
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
