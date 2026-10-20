// 文言を言語に合わせて出す。文言は messages.ts の表にあるものだけを使う
import { type Lang, MESSAGES, type MessageKey } from "./messages"

export type { Lang, MessageKey }
export const LANGS: readonly Lang[] = ["ja", "en"]

// 言語を選ぶ欄に出す名前。どの言語の画面でも、その言語自身の書き方で出す
export const LANG_NAMES: Readonly<Record<Lang, string>> = { ja: "日本語", en: "English" }

export type Params = Readonly<Record<string, string | number>>

export function translate(lang: Lang, key: MessageKey, params: Params = {}): string {
  const text: string = lang === "ja" ? key : MESSAGES[key][lang]
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

// ブラウザなどの言語の並び（好む順）から決める。日本語でなければ英語
export function detectLang(preferred: readonly string[]): Lang {
  const first = preferred[0]?.toLowerCase() ?? ""
  return first === "ja" || first.startsWith("ja-") ? "ja" : "en"
}
