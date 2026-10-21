// 文言を言語に合わせて出す。文言は、app の登録表が持つ文言の表（土台の文言・プラグインの文言・言語パックの訳）から引く
import type { Lang, MessageKey, Translations } from "./messages"

export type { Lang, MessageKey }
export type Messages = ReadonlyMap<string, Translations>

export type Params = Readonly<Record<string, string | number>>

// 訳の無い言語と、表に無い鍵（型の表に書き足したのに、そのプラグインを渡していない app など）は、英語の鍵をそのまま出す
export function translate(messages: Messages, lang: Lang, key: MessageKey, params: Params = {}): string {
  const text: string = messages.get(key)?.[lang] ?? key
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

// 好む言語の並び（ブラウザの言語など。好む順）から、app にある最初の言語を選ぶ。地域の付いた id（ja-JP）は言語の部分で見る。無ければ英語
export function detectLang(preferred: readonly string[], langs: readonly Lang[]): Lang {
  for (const p of preferred) {
    const id = p.toLowerCase()
    const hit = langs.find(l => l === id) ?? langs.find(l => l === id.split("-")[0])
    if (hit) return hit
  }
  return "en"
}
