// 道具のアイコンを右ボタンの長押しで出すまでの時間（利用者の設定の項目）: 選べる時間はミリ秒の固定の並び。値は設定の画面のセレクトForm に出る文字で持つ
import { z } from "zod"
import { kit } from "../kit"

export const HOLD_MS_CHOICES = ["150", "200", "250", "300", "350", "400", "450", "500"] as const
const DEFAULT_HOLD_MS = 250

export const TOOL_PICKER_HOLD = kit.defineSetting({
  id: "tool-picker-hold",
  title: "Tool picker hold time (ms)",
  schema: z.enum(HOLD_MS_CHOICES),
  default: "250",
})

// 選んだ時間（ミリ秒）。形に合わない値なら既定
export function holdMsOf(value: unknown): number {
  const parsed = TOOL_PICKER_HOLD.schema.safeParse(value)
  return parsed.success ? Number(parsed.data) : DEFAULT_HOLD_MS
}
