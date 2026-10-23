// 紙のプラグインの文言（各フォルダの文言を集めたもの）
import { PLACING_MESSAGES } from "./placing/messages"
import { PAPER_VIEW_MESSAGES } from "./view/messages"

export const PAPER_MESSAGES = { ...PLACING_MESSAGES, ...PAPER_VIEW_MESSAGES }
