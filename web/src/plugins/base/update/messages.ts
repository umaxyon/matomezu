// 版の更新の文言
import { defineMessages } from "../../../core/i18n/messages"

export const UPDATE_MESSAGES = defineMessages({
  "matomezu was updated": { en: "matomezu was updated", ja: "matomezu が更新されました" },
  "{from} → {to}": { en: "{from} → {to}", ja: "{from} → {to}" },
  "The data format changed": { en: "The data format changed", ja: "データの形が変わりました" },
  "{count} edits did not reach the server and are lost when you reload": {
    en: "{count} edits did not reach the server and are lost when you reload",
    ja: "届いていない操作が {count} 件あり、読み込み直すと消えます",
  },
  "Reload the screen": { en: "Reload the screen", ja: "画面を読み込み直す" },
})
