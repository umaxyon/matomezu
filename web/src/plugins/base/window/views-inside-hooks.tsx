// スクリーンの定義の viewsInside の、開く側のフック（views-inside.ts）
import { useCallback } from "react"
import type { ScreenId } from "../../../core/catalog"
import { useSetPluginStateById } from "../../../ui/plugin-state-hooks"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { viewInsideOf } from "./views-inside"

// 開く側のフック: 定義 screenDef のスクリーンから base のスクリーンの定義 def を開く前に呼ぶと、そのスクリーンが def の画面を中に描いていれば、それを出す値を入れる
export function usePutViewInside(def: ScreenId): (screenDef: string) => void {
  const catalog = useCoreCatalog()
  const setById = useSetPluginStateById()
  return useCallback(
    (screenDef: string) => {
      const inside = viewInsideOf(catalog, screenDef, def)
      if (inside) setById(inside.state, inside.value, { screenDef })
    },
    [catalog, setById, def],
  )
}
