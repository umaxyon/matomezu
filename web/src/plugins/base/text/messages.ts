// 本文の装飾と文字の色・文字の領域の入力Formの文言
import { defineMessages } from "../../../core/i18n/messages"

export const TEXT_MESSAGES = defineMessages({
  Success: { en: "Success", ja: "成功" },
  Info: { en: "Info", ja: "情報" },
  Warning: { en: "Warning", ja: "注意" },
  Error: { en: "Error", ja: "エラー" },
  Bold: { en: "Bold", ja: "太字" },
  "Body decoration": { en: "Body decoration", ja: "本文の装飾" },
  "No color": { en: "No color", ja: "色なし" },
  "Text colors": { en: "Text colors", ja: "文字の色" },
  "The colors you can give part of a text in a text box. Used in the body of a box on a drawing and so on": {
    en: "The colors you can give part of a text in a text box. Used in the body of a box on a drawing and so on",
    ja: "マルチ入力ボックスで変更可能な文字色の指定。図面ボックスの本文などで使用",
  },
  Caption: { en: "Caption", ja: "キャプション" },
  "Caption alignment": { en: "Caption alignment", ja: "キャプションの寄せ" },
  Divider: { en: "Divider", ja: "区切り線" },
  Body: { en: "Body", ja: "本文" },
  "Body alignment": { en: "Body alignment", ja: "本文の寄せ" },
  "Can no longer write, so the text was discarded": {
    en: "Can no longer write, so the text was discarded",
    ja: "書けなくなったので、書いた字を捨てました",
  },
})
