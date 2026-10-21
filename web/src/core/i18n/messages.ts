// 文言の表の型と、土台の文言。鍵は英語の文そのもので、ほかの言語の訳を持つ（訳の無い言語では英語の鍵を出す）。{name} は t() に渡す値で置き換える。
// プラグインは自分の文言を defineMessages で書き、プラグインの messages に渡して、型の表（MessageTable）に書き足す。
// 言語は言語パック（LanguagePack）が持ち込む。パックは言語の名前と、どのプラグインの文言にでも足せる訳を持つ
import type { MessageKey } from "../tables"

export type Lang = string // 言語の id（BCP 47 の言語の部分。"en"・"ja"・"fr" など）

// 1 つの文言の、英語のほかの言語の訳（英語は鍵そのもの）。無い言語は英語を出す
export type Translations = Readonly<Record<Lang, string>>
export type MessageSet = Readonly<Record<string, Translations>>

// 書いた鍵と訳を文字のまま型に残す（型の表で、同じ鍵に違う訳を書き足すと型の誤りになる）
export const defineMessages = <const M extends Record<string, Translations>>(messages: M): M => messages

// 言語パック: 言語 1 つの名前（その言語自身の書き方）と、文言の鍵 → 訳。
// プラグインが自分の文言に持つ訳より、パックの訳が勝つ。app に無い鍵の訳は使わない
export interface LanguagePack {
  lang: Lang
  name: string
  messages: Readonly<Partial<Record<MessageKey, string>>>
}
export const defineLanguagePack = <const P extends LanguagePack>(pack: P): P => pack

// 土台が持つ言語（英語は鍵そのもの。日本語の訳は、どの文言も自分の表に持つ）
export const LANGUAGES: readonly LanguagePack[] = [
  { lang: "en", name: "English", messages: {} },
  { lang: "ja", name: "日本語", messages: {} },
]

// 土台（core・store・ui）が使う文言
export const MESSAGES = defineMessages({
  "Add page": { ja: "ページを足す" },
  "Page {n}": { ja: "ページ {n}" },
  Stage: { ja: "ステージ" },
  "Select a book": { ja: "ブックを選択してください" },
  "Search books": { ja: "ブックを探す" },
  "Search by book name": { ja: "ブックの名前で探す" },
  Books: { ja: "ブック" },
  "No matching books": { ja: "当てはまるブックはありません" },
  Dark: { ja: "ダーク" },
  Light: { ja: "ライト" },
  Portrait: { ja: "縦" },
  Landscape: { ja: "横" },
  "Book menu": { ja: "ブックのメニュー" },
  Tools: { ja: "ツール" },
})

declare module "../tables" {
  interface MessageTable extends Readonly<typeof MESSAGES> {}
}

export type { MessageKey } from "../tables"
