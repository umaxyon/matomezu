// ソースのペインで Tab キーを押したときに書く字（利用者の設定の項目）: Tab 文字か、半角スペース（2 つか 4 つ）。
// Tab 文字を選んでいる間も、半角スペースの数は覚えておく（半角スペースに戻したときに使う）
import { z } from "zod"
import { kit } from "./kit"

const TabKeySchema = z.strictObject({
  writes: z.enum(["tab", "spaces"]), // 書く物
  spaces: z.union([z.literal(2), z.literal(4)]), // 半角スペースの数
})
export type TabKey = z.infer<typeof TabKeySchema>
export const TAB_KEY_SPACES = [2, 4] as const

export const TAB_KEY = kit.defineSetting({
  id: "tab-key",
  title: "Tab key",
  schema: TabKeySchema,
  default: { writes: "tab", spaces: 4 },
})

// 選んだ物で書く字（形に合わない値なら Tab 文字）
export function tabKeyText(value: unknown): string {
  const parsed = TabKeySchema.safeParse(value)
  return parsed.success && parsed.data.writes === "spaces" ? " ".repeat(parsed.data.spaces) : "\t"
}
