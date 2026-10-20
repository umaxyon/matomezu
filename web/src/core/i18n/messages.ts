// 文言の表の型と、土台の文言。鍵は日本語の文そのもので、ほかの言語の訳を持つ。{name} は t() に渡す値で置き換える。
// プラグインは自分の文言を defineMessages で書き、プラグインの messages に渡して、型の表（MessageTable）に書き足す
export type Lang = "ja" | "en"

// 1 つの文言の、日本語のほかの言語の訳（日本語は鍵そのもの）
export type Translations = Readonly<Record<Exclude<Lang, "ja">, string>>
export type MessageSet = Readonly<Record<string, Translations>>

// 書いた鍵と訳を文字のまま型に残す（型の表で、同じ鍵に違う訳を書き足すと型の誤りになる）
export const defineMessages = <const M extends Record<string, Translations>>(messages: M): M => messages

// 土台（core・store・ui）が使う文言
export const MESSAGES = defineMessages({
  ページを足す: { en: "Add page" },
  "ページ {n}": { en: "Page {n}" },
  ステージ: { en: "Stage" },
  ブックを選択してください: { en: "Select a book" },
  ブックを探す: { en: "Search books" },
  ブックの名前で探す: { en: "Search by book name" },
  ブック: { en: "Books" },
  当てはまるブックはありません: { en: "No matching books" },
  ダーク: { en: "Dark" },
  ライト: { en: "Light" },
  縦: { en: "Portrait" },
  横: { en: "Landscape" },
  ブックのメニュー: { en: "Book menu" },
  ツール: { en: "Tools" },
})

declare module "../tables" {
  interface MessageTable extends Readonly<typeof MESSAGES> {}
}

export type { MessageKey } from "../tables"
