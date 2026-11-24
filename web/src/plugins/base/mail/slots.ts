// 郵便箱の画面の、選んだ郵便の下の行のスロットの名前と、渡す物（base の ui.tsx で、core/catalog.ts の表に書き足す）

import { kit } from "../kit"
import type { Mail } from "./mail"

export const MAIL_ACTIONS = kit.name("mail-actions")

// 郵便箱の画面の、選んだ郵便の下の行のスロットに渡す物: 選んでいる郵便と、その行き先を開いて見せる関数（郵便箱は開いたまま。行き先が無ければ何もしない）
export interface MailActionsProps {
  mail: Mail
  showPlace: () => void
}
