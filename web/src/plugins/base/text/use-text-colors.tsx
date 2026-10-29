// ステージ stage が開いているブックで効いている文字の色（ブックの上書きと、利用者の設定の上書き）。ブックを開いていなければ null
import { useMemo } from "react"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useUserSetting } from "../../../ui/view-hooks"
import { type TextColorValues, textColorsOf, USER_TEXT_COLORS } from "./text-colors"

export function useTextColors(stage: string): ReadonlyMap<string, string> | null {
  const catalog = useCatalog().core
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const viewer = useUserSetting(USER_TEXT_COLORS.id) as TextColorValues
  return useMemo(() => (book ? textColorsOf(catalog, book, viewer) : null), [catalog, book, viewer])
}
