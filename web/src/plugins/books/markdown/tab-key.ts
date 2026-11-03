// ソースのペインで Tab キーを押したときに書く字（利用者の設定の項目）: Tab 文字か、半角スペース 2 つ・4 つ
import { z } from "zod"
import { kit } from "./kit"

const TabKeyChoice = z.enum(["tab", "spaces-2", "spaces-4"])
type TabKeyChoice = z.infer<typeof TabKeyChoice>

export const TAB_KEY = kit.defineSetting({
  id: "tab-key",
  title: "Tab key in the source",
  schema: TabKeyChoice,
  default: "tab",
  optionTitles: {
    tab: kit.message("Tab character"),
    "spaces-2": kit.message("2 spaces"),
    "spaces-4": kit.message("4 spaces"),
  },
})

const WRITES: Record<TabKeyChoice, string> = { tab: "\t", "spaces-2": "  ", "spaces-4": "    " }

// 選んだ物で書く字（形に合わない値なら Tab 文字）
export function tabKeyText(choice: unknown): string {
  const parsed = TabKeyChoice.safeParse(choice)
  return WRITES[parsed.success ? parsed.data : "tab"]
}
