// マスターのプラグインの文言（ブックのタイプの名前と、マスターの画面の文言）
import { defineMessages } from "../../../plugin-api"
import { MASTER_VIEW_MESSAGES } from "./view/messages"

export const MASTER_MESSAGES = {
  ...defineMessages({
    Master: { en: "Master", ja: "マスター" },
  }),
  ...MASTER_VIEW_MESSAGES,
}
