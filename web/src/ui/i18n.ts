// 今の言語の t()。言語が変われば、使っている部品が描き直される
import { type MessageKey, type Params, translate } from "../core/i18n/i18n"
import { useApp } from "./store-context"

export function useT(): (key: MessageKey, params?: Params) => string {
  const lang = useApp(s => s.settings.lang)
  return (key, params) => translate(lang, key, params)
}
