// ステージ stage が開いているブックのテーマの値（CSS 変数）。ブックの設定のダイアログの下書きを重ねたブックで決める。ブックを開いていなければ undefined
import { type CSSProperties, useMemo } from "react"
import { useCatalog } from "../../../ui/store-context"
import { themeVars } from "../../../ui/theme-vars"
import { useShownBook } from "../../../ui/view-hooks"
import { bookTokens } from "./look"

export function useBookThemeVars(stage: string): CSSProperties | undefined {
  const catalog = useCatalog().core
  const book = useShownBook(stage)
  return useMemo(() => (book ? themeVars(bookTokens(catalog, book)) : undefined), [catalog, book])
}
