// ソースのペインで Tab キーを押したときに書く字（利用者の設定の項目）: Tab 文字か、半角スペース 2 つ・4 つ
import { z } from "zod"
import { kit } from "./kit"

const TAB_KEY_CHOICES = ["tab", "spaces-2", "spaces-4"] as const
export type TabKeyChoice = (typeof TAB_KEY_CHOICES)[number]

export const TAB_KEY = kit.defineSetting({
  id: "tab-key",
  title: "Tab key in the source",
  schema: z.enum(TAB_KEY_CHOICES),
  default: "tab",
  optionTitles: {
    tab: kit.message("Tab character"),
    "spaces-2": kit.message("2 spaces"),
    "spaces-4": kit.message("4 spaces"),
  },
})

const WRITES: Record<TabKeyChoice, string> = { tab: "\t", "spaces-2": "  ", "spaces-4": "    " }

// 選んだ物で書く字（形に合わない値なら Tab 文字）
export const tabKeyText = (choice: unknown): string => WRITES[choice as TabKeyChoice] ?? WRITES.tab
