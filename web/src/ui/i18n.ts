// 今の言語の t()。言語が変われば、使っているコンポーネントが描き直される
import { type MessageKey, type Params, translate } from "../core/i18n/i18n"
import { useCatalog, useMatomezuState } from "./store-context"

export function useT(): (key: MessageKey, params?: Params) => string {
  const lang = useMatomezuState(s => s.lang)
  const { messages } = useCatalog().core
  return (key, params) => translate(messages, lang, key, params)
}

// プラグインの見た目の t(): 自分の文言を pluginKit に渡した短い鍵で引く。機能台帳の文言の鍵（定義の名前・土台の文言など）もそのまま渡せる
export function useMessages<K extends string>(kit: {
  message(key: K): string
}): (key: K | MessageKey, params?: Params) => string {
  const lang = useMatomezuState(s => s.lang)
  const { messages } = useCatalog().core
  return (key, params) => {
    const own = kit.message(key as K)
    return translate(messages, lang, (messages.has(own) ? own : key) as MessageKey, params)
  }
}
