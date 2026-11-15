// 郵便のダイアログの下の行のスロットの名前と、渡す物（base の ui.tsx で、core/catalog.ts の表に書き足す）

import { kit } from "../kit"
import type { Mail } from "./mail"

export const MAIL_ACTIONS = kit.name("mail-actions")

// 郵便のダイアログの下の行のスロットに渡す物: 開いている郵便、ダイアログを閉じる関数、
// ダイアログを窓の右の端に寄せてほかの操作を止めないようにする関数（郵便を開いたまま行き先を見せるとき）
export interface MailActionsProps {
  mail: Mail
  onClose: () => void
  dock: () => void
}
