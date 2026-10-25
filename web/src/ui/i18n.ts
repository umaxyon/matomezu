// 今の言語の t()。言語が変われば、使っているコンポーネントが描き直される
import { type MessageKey, type Params, translate } from "../core/i18n/i18n"
import { useCatalog, useMatomezuState } from "./store-context"

export function useT(): (key: MessageKey, params?: Params) => string {
  const lang = useMatomezuState(s => s.settings.lang)
  const { messages } = useCatalog().core
  return (key, params) => translate(messages, lang, key, params)
}
