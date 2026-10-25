// 今の言語の t()。言語が変われば、使っているコンポーネントが描き直される
import { type MessageKey, type Params, translate } from "../core/i18n/i18n"
import { useApp, useRegistry } from "./store-context"

export function useT(): (key: MessageKey, params?: Params) => string {
  const lang = useApp(s => s.settings.lang)
  const { messages } = useRegistry()
  return (key, params) => translate(messages, lang, key, params)
}
