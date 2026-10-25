// ex1 の文言。鍵は「ex1/名前」で、英語（en）と日本語の訳を持つ
import { defineMessages } from "matomezu"

export const EX1_MESSAGES = defineMessages({
  "ex1/sayHello": { en: "Say hello", ja: "あいさつする" },
  "ex1/helloName": { en: "Hello, {name}", ja: "こんにちは、{name}" },
  "ex1/switchLanguage": { en: "Switch language", ja: "言語を切り替える" },
  "ex1/inspectItem": { en: "Inspect item", ja: "アイテムを調べる" },
  "ex1/itemId": { en: "Item {id}", ja: "アイテム {id}" },
  "ex1/pageSettings": { en: "Page settings by ex1", ja: "ex1 のページの設定" },
  "ex1/close": { en: "Close", ja: "閉じる" },
})

// フランス語を持ち込む（自分の文言と、ビルトインの文言の訳）
export const EX1_FRENCH = {
  lang: "fr",
  name: "Français",
  messages: {
    "ex1/sayHello": "Dire bonjour",
    "ex1/helloName": "Bonjour, {name}",
    "ex1/switchLanguage": "Changer de langue",
    "Add page": "Ajouter une page",
  },
} as const
