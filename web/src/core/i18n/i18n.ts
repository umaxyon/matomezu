// 文言を言語に合わせて出す。文言は、app の登録表が持つ文言の表（土台の文言とプラグインの文言）から引く
import type { Lang, MessageKey, Translations } from "./messages"

export type { Lang, MessageKey }
export type Messages = ReadonlyMap<string, Translations>
export const LANGS: readonly Lang[] = ["ja", "en"]

// 言語を選ぶ欄に出す名前。どの言語の画面でも、その言語自身の書き方で出す
export const LANG_NAMES: Readonly<Record<Lang, string>> = { ja: "日本語", en: "English" }

export type Params = Readonly<Record<string, string | number>>

// 表に無い鍵（型の表に書き足したのに、そのプラグインを渡していない app など）は、日本語の鍵をそのまま出す
export function translate(messages: Messages, lang: Lang, key: MessageKey, params: Params = {}): string {
  const text: string = lang === "ja" ? key : (messages.get(key)?.[lang] ?? key)
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

// ブラウザなどの言語の並び（好む順）から決める。日本語でなければ英語
export function detectLang(preferred: readonly string[]): Lang {
  const first = preferred[0]?.toLowerCase() ?? ""
  return first === "ja" || first.startsWith("ja-") ? "ja" : "en"
}
