// 文言を言語に合わせて出す。文言は、インスタンスの機能台帳が持つ文言の表（土台の文言・プラグインの文言・言語パックの訳）から引く
import type { Lang, MessageKey, Translations } from "./messages"

export type { Lang, MessageKey }
export type Messages = ReadonlyMap<string, Translations>

export type Params = Readonly<Record<string, string | number>>

// 訳の無い言語と、表に無い鍵（機能台帳の型の側に書き足したのに、そのプラグインを渡していないインスタンスなど）は、英語の鍵をそのまま出す
export function translate(messages: Messages, lang: Lang, key: MessageKey, params: Params = {}): string {
  // 訳の無い言語では英語の文（追加プラグインの鍵は必ず en を持つ。ビルトインの鍵は英語の文そのもの）
  const t = messages.get(key)
  const text: string = t?.[lang] ?? t?.en ?? key
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

// 好む言語の並び（ブラウザの言語など。好む順）から、インスタンスにある最初の言語を選ぶ。地域の付いた id（ja-JP）は言語の部分で見る。無ければ英語
export function detectLang(preferred: readonly string[], langs: readonly Lang[]): Lang {
  for (const p of preferred) {
    const id = p.toLowerCase()
    const hit = langs.find(l => l === id) ?? langs.find(l => l === id.split("-")[0])
    if (hit) return hit
  }
  return "en"
}
