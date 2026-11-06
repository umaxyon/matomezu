// ステージで開いたブックを描く所に付ける CSS 変数: ブックのテーマの値と文字の色の値（どちらもブックの設定のダイアログの下書きを重ねる）と、
// ブックのタイプのプラグインのテーマキー（--<名前>）。ステージの中のブックの中身と、印刷で body の直下に描く物が使う
import { type CSSProperties, useMemo } from "react"
import type { BookTypeId } from "../../../core/core-catalog"
import { useTokenScope } from "../../../ui/theme-vars"
import { textColorVars } from "../text"
import { useTextColors } from "../text/use-text-colors"
import { useBookThemeVars } from "./use-book-theme-vars"

export function useBookLookStyle(stage: string, type: BookTypeId): CSSProperties {
  const theme = useBookThemeVars(stage)
  const colors = useTextColors(stage)
  const tokens = useTokenScope(type)
  return useMemo(
    () => ({ ...(colors ? { ...theme, ...textColorVars(colors) } : {}), ...tokens }) as CSSProperties,
    [theme, colors, tokens],
  )
}
