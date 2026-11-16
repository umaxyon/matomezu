// 描いているページのテーマの値（CSS 変数）。設定のダイアログの下書きを重ねたページで決める。ページを描いていなければ undefined
import { type CSSProperties, useMemo } from "react"
import { useCatalog } from "../../../ui/store-context"
import { themeVars } from "../../../ui/theme-vars"
import { useShownPage } from "../../../ui/view-hooks"
import { pageTokens } from "./look"

export function usePageThemeVars(): CSSProperties | undefined {
  const catalog = useCatalog().core
  const page = useShownPage()
  return useMemo(() => (page ? themeVars(pageTokens(catalog, page)) : undefined), [catalog, page])
}
