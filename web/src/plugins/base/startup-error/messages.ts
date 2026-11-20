// 起動エラーの画面の文言。見出しは訳によらず 1 つ、説明・ボタン・外せなかったときの 1 行目・補足は訳（StartupErrorKind）ごと
import { defineMessages } from "../../../core/i18n/messages"

export const STARTUP_ERROR_MESSAGES = defineMessages({
  "Cannot open matomezu": { en: "Cannot open matomezu", ja: "matomezu を開けません" },
  "Some added plugins could not be added": {
    en: "Some added plugins could not be added",
    ja: "組み込めない追加プラグインがあります",
  },
  "Remove and open": { en: "Remove and open", ja: "外して開く" },
  "Could not remove": { en: "Could not remove", ja: "外せませんでした" },
  "Cannot reach the matomezu server": { en: "Cannot reach the matomezu server", ja: "常駐につながりません" },
  "Pages of removed plugins move to the unreadable folder, and come back when the plugins are added again": {
    en: "Pages of removed plugins move to the unreadable folder, and come back when the plugins are added again",
    ja: "外したプラグインのページは読めない物のフォルダへ移り、足し直すと元の所へ戻ります",
  },
})
