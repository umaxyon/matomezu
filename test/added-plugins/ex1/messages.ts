// ex1 の文言。鍵は好きに付けてよく（頭は kit が付ける）、英語（en）と日本語の訳を持つ
import { defineMessages } from "matomezu"

export const EX1_MESSAGES = defineMessages({
  sayHello: { en: "Say hello", ja: "あいさつする" },
  helloName: { en: "Hello, {name}", ja: "こんにちは、{name}" },
  switchLanguage: { en: "Switch language", ja: "言語を切り替える" },
  inspectItem: { en: "Inspect item", ja: "アイテムを調べる" },
  itemId: { en: "Item {id}", ja: "アイテム {id}" },
  pageSettings: { en: "Page settings by ex1", ja: "ex1 のページの設定" },
  close: { en: "Close", ja: "閉じる" },
})

// フランス語を持ち込む（自分の文言と、ビルトインの文言の訳）
export const EX1_FRENCH = {
  lang: "fr",
  name: "Français",
  messages: {
    "ex1:sayHello": "Dire bonjour",
    "ex1:helloName": "Bonjour, {name}",
    "ex1:switchLanguage": "Changer de langue",
    "Add page": "Ajouter une page",
  },
} as const
