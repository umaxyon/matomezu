// 郵便箱のボタン（ブックスクリーンのフッタの封筒）の角に出す未読の数を、どの送り手の郵便で数えるか（利用者の設定の項目）
import { z } from "zod"
import { kit } from "../kit"
import type { UnreadOf } from "./inbox"

// 選べる値: AI と人の合計・AI からの郵便だけ・人からの郵便だけ
const UNREAD_CHOICES = ["all", "ai", "user"] as const satisfies readonly UnreadOf[]

export const MAILBOX_UNREAD = kit.defineSetting({
  id: "mailbox-unread",
  title: "Unread count on the mailbox button",
  schema: z.enum(UNREAD_CHOICES),
  default: "all",
  optionTitles: {
    all: kit.message("From AIs and people"),
    ai: kit.message("From AIs"),
    user: kit.message("From people"),
  },
})

// 設定の値 choice（形に合わなければ既定）
export const unreadChoiceOf = (choice: unknown): UnreadOf =>
  MAILBOX_UNREAD.schema.safeParse(choice).data ?? MAILBOX_UNREAD.default
