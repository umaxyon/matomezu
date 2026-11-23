// ページを描く所に付ける CSS 変数: 描いているページ（ui/scope.tsx の描いている場所）のテーマの値と文字の色の値（どちらも設定のダイアログの下書きを重ねる）と、
// ページのタイプのプラグインのテーマキー（--<名前>）。テーマはページごとなので、ページを描く所ごとに置く:
// ステージは開いているページ、ステージの外で見るだけに描くページ（印刷区画・サムネイル・スクラップ）は、そのページ（PageLook で包む）

import { type CSSProperties, type ReactNode, useMemo } from "react"
import { NO_PAGE } from "../../../core/stage"
import { useCatalog } from "../../../ui/store-context"
import { tokenScopeOf } from "../../../ui/theme-vars"
import { useShownPage } from "../../../ui/view-hooks"
import { textColorVars } from "../text"
import { useTextColors } from "../text/use-text-colors"
import { usePageThemeVars } from "./use-page-theme-vars"

// 描いているページの見た目の CSS 変数（ページを描いていなければ空）
export function usePageLookStyle(): CSSProperties {
  const theme = usePageThemeVars()
  const colors = useTextColors()
  const page = useShownPage()
  const type = page === NO_PAGE ? undefined : page.type
  const catalog = useCatalog().core
  return useMemo(
    () =>
      ({
        ...(colors ? { ...theme, ...textColorVars(colors) } : {}),
        ...(type === undefined ? {} : tokenScopeOf(catalog, type)),
      }) as CSSProperties,
    [theme, colors, catalog, type],
  )
}

// 描いているページの見た目の CSS 変数を、中の物に渡す（箱を作らない要素で包む。描いている場所を置いた中で使う）
export function PageLook({ children }: { children: ReactNode }) {
  const style = usePageLookStyle()
  return <div style={{ display: "contents", ...style }}>{children}</div>
}
