// ステージ stage が開いているブックで効いている文字の色（ブックの上書きと、利用者の設定の上書き。利用者の上書きがいちばん強い）。
// ブックの設定のダイアログの下書きを重ねたブックで決める。ブックを開いていなければ null
import { useMemo } from "react"
import { useCatalog } from "../../../ui/store-context"
import { useShownBook, useUserSetting } from "../../../ui/view-hooks"
import { type TextColorValues, textColorsOf, USER_TEXT_COLORS } from "./text-colors"

export function useTextColors(stage: string): ReadonlyMap<string, string> | null {
  const catalog = useCatalog().core
  const book = useShownBook(stage)
  const viewer = useUserSetting(USER_TEXT_COLORS.id) as TextColorValues
  return useMemo(() => (book ? textColorsOf(catalog, book, viewer) : null), [catalog, book, viewer])
}
