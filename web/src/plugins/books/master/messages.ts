// マスターのプラグインの文言（ブックのタイプの名前と、各フォルダの文言を集めたもの）
import { defineMessages } from "../../../core/i18n/messages"
import { BOOK_NEW_MESSAGES } from "./book-new/messages"
import { MASTER_VIEW_MESSAGES } from "./view/messages"

export const MASTER_MESSAGES = {
  ...defineMessages({
    Master: { ja: "マスター" },
  }),
  ...BOOK_NEW_MESSAGES,
  ...MASTER_VIEW_MESSAGES,
}
