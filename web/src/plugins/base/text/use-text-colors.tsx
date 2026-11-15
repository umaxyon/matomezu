// 描いているページで効いている文字の色（ページの上書きと、利用者の設定の上書き。利用者の上書きがいちばん強い）。
// 設定のダイアログの下書きを重ねたページで決める。ページを描いていなければ null
import { useMemo } from "react"
import { useCatalog } from "../../../ui/store-context"
import { useShownPage, useUserSetting } from "../../../ui/view-hooks"
import { type TextColorValues, textColorsOf, USER_TEXT_COLORS } from "./text-colors"

export function useTextColors(): ReadonlyMap<string, string> | null {
  const catalog = useCatalog().core
  const page = useShownPage()
  const viewer = useUserSetting(USER_TEXT_COLORS.id) as TextColorValues
  return useMemo(() => (page ? textColorsOf(catalog, page, viewer) : null), [catalog, page, viewer])
}
