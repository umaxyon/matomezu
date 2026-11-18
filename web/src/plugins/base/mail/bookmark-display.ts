import { isLight } from "../../../core/color"
import { birdColors } from "../birds/colors"
import type { Participant } from "../participant"
import { type Mail, MailSchema } from "./mail"

export const MAX_MAIL_BOOKMARKS = 3

// 1 通ごとのしおりは届いた時の色を使い、送り手が退室したら絵だけ封筒に替える
export function mailBookmarksOf(unread: readonly Mail[], participants: readonly Participant[]) {
  return unread.toReversed().map(mail => {
    const parsed = MailSchema.shape.sender.safeParse(mail.sender)
    const sender = parsed.success ? parsed.data : undefined
    const bird = sender && participants.some(p => p.id === sender.participant && p.state === "joined") ? sender : null
    const color = sender ? birdColors(sender.bird, sender.palette).flag : undefined
    return {
      mail,
      bird,
      tone: Number.isSafeInteger(mail.order) ? (mail.order - 1) % MAX_MAIL_BOOKMARKS : 0,
      color,
      ink: color && (isLight(color) ? "black" : "white"),
    }
  })
}
