// 郵便のダイアログの下の行のスロットの名前と、渡す物（base の ui.tsx で、core/catalog.ts の表に書き足す）
import type { Mail } from "../../../core/mail"
import { kit } from "../kit"

export const MAIL_ACTIONS = kit.name("mail-actions")

// 郵便のダイアログの下の行のスロットに渡す物: ダイアログを出したステージと、開いている郵便、ダイアログを閉じる関数
export interface MailActionsProps {
  stage: string
  mail: Mail
  onClose: () => void
}
