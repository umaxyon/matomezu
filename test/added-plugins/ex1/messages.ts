// ex1 の文言。鍵は英語の文で、日本語の訳を持つ
import { defineMessages } from "matomezu"

export const EX1_MESSAGES = defineMessages({
  "Say hello": { ja: "あいさつする" },
  "Hello, {name}": { ja: "こんにちは、{name}" },
  "Switch language": { ja: "言語を切り替える" },
  "Inspect item": { ja: "アイテムを調べる" },
  "Item {id}": { ja: "アイテム {id}" },
  "Page settings by ex1": { ja: "ex1 のページの設定" },
  Close: { ja: "閉じる" },
})

// フランス語を持ち込む（自分の文言と、ビルトインの文言の訳）
export const EX1_FRENCH = {
  lang: "fr",
  name: "Français",
  messages: {
    "Say hello": "Dire bonjour",
    "Hello, {name}": "Bonjour, {name}",
    "Switch language": "Changer de langue",
    "Add page": "Ajouter une page",
  },
} as const
