// 文言の表の型と、土台の文言。鍵は英語の文そのもので、ほかの言語の訳を持つ（訳の無い言語では英語の鍵を出す）。{name} は t() に渡す値で置き換える。
// プラグインは自分の文言を defineMessages で書いて pluginKit に渡し、core/catalog.ts（MessageTable）に書き足す。pluginKit が id を付けた文言の組（MessageSetDef）にする。
// 言語は言語パック（LanguagePackDef。kit.defineLanguagePack）が持ち込む。パックは言語の名前と、どのプラグインの文言にでも足せる訳を持つ。
// 土台の文言と言語の id の頭は matomezu（id が matomezu のプラグインを入れると、同じ id の重なり E001 で止まる）
import type { LanguagePackExtras, MessageKey, MessageSetExtras } from "../catalog"

export type Lang = string // 言語の id（BCP 47 の言語の部分。"en"・"ja"・"fr" など）

// 1 つの文言の、英語のほかの言語の訳（英語は鍵そのもの）。無い言語は英語を出す
export type Translations = Readonly<Record<Lang, string>>
// 文言の鍵 → 訳
export type MessageMap = Readonly<Record<string, Translations>>

// 文言の組: プラグイン 1 つの文言（id は「プラグインの id:messages」。pluginKit が付ける）
export interface MessageSetDef extends MessageSetExtras {
  id: string
  messages: MessageMap
}

// 書いた鍵と訳を文字のまま型に残す（core/catalog.ts の MessageTable で、同じ鍵に違う訳を書き足すと型の誤りになる）
export const defineMessages = <const M extends Record<string, Translations>>(messages: M): M => messages

// 2 つの表で、同じ鍵に違う訳を書いた鍵
type Clash<A, B> = {
  [K in keyof A & keyof B]: [A[K]] extends [B[K]] ? ([B[K]] extends [A[K]] ? never : K) : K
}[keyof A & keyof B]
// 並びの表で、前のどれかの表と同じ鍵に違う訳を書いた鍵（Seen は前の表を重ねたもの）
type Clashes<T extends readonly unknown[], Seen = unknown> = T extends readonly [infer H, ...infer R]
  ? Clash<Seen, H> | Clashes<R, Seen & H>
  : never
// 並びの表を重ねたもの
type Joined<T extends readonly unknown[], Seen = unknown> = T extends readonly [infer H, ...infer R]
  ? Joined<R, Seen & H>
  : Seen

// 1 つのプラグインの中で、フォルダごとの文言の表を 1 つにする。同じ鍵に違う訳を書いた表があれば型の誤り（keys にその鍵が出る）。同じ訳の重なりは通す。
// 表は defineMessages で書いた物を渡す（MessageMap のような広い型の表では鍵が string になり、どの鍵も重なりとして誤りになる）
export function joinMessages<const T extends readonly MessageMap[]>(
  ...tables: [Clashes<T>] extends [never] ? T : { error: "the same key has different translations"; keys: Clashes<T> }[]
): Joined<T> {
  return Object.assign({}, ...tables)
}

// 言語パック: 言語 1 つの名前（その言語自身の書き方）と、文言の鍵 → 訳。
// プラグインが自分の文言に持つ訳より、パックの訳が勝つ。インスタンスに無い鍵の訳は使わない
export interface LanguagePackDef extends LanguagePackExtras {
  id: string // 「プラグインの id:言語」（kit.defineLanguagePack が付ける。1 つのプラグインは同じ言語を 2 組持たない）
  lang: Lang
  name: string
  messages: Readonly<Partial<Record<MessageKey, string>>>
}

// 土台が持つ言語（英語は鍵そのもの。日本語の訳は、どの文言も自分の表に持つ）
export const LANGUAGES: readonly LanguagePackDef[] = [
  { id: "matomezu:en", lang: "en", name: "English", messages: {} },
  { id: "matomezu:ja", lang: "ja", name: "日本語", messages: {} },
]

// 土台（core・store・ui）が使う文言
export const MESSAGES = defineMessages({
  "An edit could not be saved": { ja: "編集を反映できませんでした" },
  // 土台のキーの範囲の題名（store/keys.ts）
  "Whole screen": { ja: "画面全体" },
  Stage: { ja: "ステージ" },
  "While a dialog is open": { ja: "ダイアログが開いている間" },
  "While a menu is open": { ja: "メニューが開いている間" },
})

// 土台の文言の組
export const CORE_MESSAGES: MessageSetDef = { id: "matomezu:messages", messages: MESSAGES }

declare module "../catalog" {
  interface MessageTable extends Readonly<typeof MESSAGES> {}
}

export type { MessageKey } from "../catalog"
