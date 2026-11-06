// 郵便のダイアログの id（開く側の郵便箱・しおりと、中身の両方が読む）
import { kit } from "../kit"

export const MAIL_DIALOG = kit.defineDialogWith<{ mail: string }>()({ id: "mail" })
