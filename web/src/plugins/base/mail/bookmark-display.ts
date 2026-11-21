import { paletteInk } from "../../../core/skin"
import { birdColors } from "../birds/colors"
import { BOOKMARK_TONES } from "../bookmarks/tones"
import type { Participant } from "../participant"
import { type Mail, MailSchema } from "./mail"

// 1 通ごとのしおりは届いた時の色を使い、送り手が退室したら絵だけ封筒に替える
export function mailBookmarksOf(unread: readonly Mail[], participants: readonly Participant[]) {
  return unread.map(mail => {
    const parsed = MailSchema.shape.sender.safeParse(mail.sender)
    const sender = parsed.success ? parsed.data : undefined
    const bird = sender && participants.some(p => p.id === sender.participant && p.state === "joined") ? sender : null
    const color = sender ? birdColors(sender.bird, sender.palette).flag : undefined
    return {
      mail,
      bird,
      // 受信順の番号を使うと、既読の郵便を除いた後、同じ色が並ぶことがある。未読内の位置で色を決めると、既読や受信のたびに色が変わる。
      tone: BOOKMARK_TONES[Number.isSafeInteger(mail.order) ? (mail.order - 1) % BOOKMARK_TONES.length : 0],
      color,
      ink: color && paletteInk(color),
    }
  })
}
